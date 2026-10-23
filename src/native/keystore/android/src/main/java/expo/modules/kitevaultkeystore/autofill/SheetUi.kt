package expo.modules.kitevaultkeystore.autofill

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.text.InputType
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import expo.modules.kitevaultkeystore.R

internal enum class ButtonKind { PRIMARY, SECONDARY, DANGER, TEXT }

/**
 * Draws the bottom sheet KiteVault shows on top of another app (the unlock, the choice of login,
 * the strong password). The two screens that use it, [AutofillAuthActivity] and
 * [AutofillSuggestActivity], keep all the logic and every security setting; this class only
 * builds the views, in code, so there is nothing to inflate or leak.
 *
 * The look: a night-blue sheet with rounded top corners that slides up, the kite and the name at
 * the top, a small pill that says which site or app it is for, big amber buttons, and rows with a
 * coloured letter for each login. Colours come from [AutofillStyle].
 */
internal class SheetUi(private val activity: Activity) {
  private val density = activity.resources.displayMetrics.density

  /** The full-screen layer. The activity turns on its overlay-tap protection. */
  val root = FrameLayout(activity)

  /** The sheet itself. The activity turns on its overlay-tap protection. */
  val sheet = LinearLayout(activity)

  private val content = LinearLayout(activity)
  private val scroller = ScrollView(activity)
  private val chip = LinearLayout(activity)
  private val chipIcon = ImageView(activity)
  private val chipText = TextView(activity)

  fun dp(value: Int): Int = (value * density).toInt()

  // --- The frame: handle, brand, who it is for ---------------------------------------------------

  /** Builds the frame and shows it. [onOutsideTap] runs when the dimmed area above the sheet is tapped. */
  fun install(onOutsideTap: () -> Unit) {
    root.setOnClickListener { onOutsideTap() }

    sheet.orientation = LinearLayout.VERTICAL
    sheet.background =
      GradientDrawable().apply {
        setColor(AutofillStyle.SHEET)
        val r = dp(SheetMetrics.SHEET_RADIUS).toFloat()
        cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
      }
    sheet.setPadding(dp(SheetMetrics.SHEET_SIDE), dp(SheetMetrics.SHEET_TOP), dp(SheetMetrics.SHEET_SIDE), dp(SheetMetrics.SHEET_BOTTOM))
    // Taps on the sheet itself must not count as taps outside it.
    sheet.setOnClickListener {}
    // A little room is always left above the sheet, so the dimmed area can be tapped to close it,
    // even when the sheet is as tall as it can be.
    root.addView(sheet, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM).apply { topMargin = dp(SheetMetrics.SHEET_GAP_ABOVE) })

    // The grab handle.
    sheet.addView(
      View(activity).apply {
        background = GradientDrawable().apply {
          setColor(AutofillStyle.HANDLE)
          cornerRadius = dp(2).toFloat()
        }
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      },
      LinearLayout.LayoutParams(dp(SheetMetrics.HANDLE_W), dp(SheetMetrics.HANDLE_H)).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        bottomMargin = dp(SheetMetrics.HANDLE_GAP)
      },
    )

    // The kite and the name.
    val brand =
      LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
      }
    brand.addView(
      ImageView(activity).apply {
        setImageResource(R.drawable.kitevault_mark)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      },
      LinearLayout.LayoutParams(dp(SheetMetrics.MARK_W), dp(SheetMetrics.MARK_H)),
    )
    brand.addView(
      TextView(activity).apply {
        text = name()
        textSize = SheetMetrics.BRAND_SP
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(AutofillStyle.TEXT)
        letterSpacing = -0.02f
      },
      LinearLayout.LayoutParams(WRAP, WRAP).apply { marginStart = dp(SheetMetrics.BRAND_GAP) },
    )
    sheet.addView(brand, LinearLayout.LayoutParams(MATCH, WRAP))

    // The pill that says which site or app this is for. Hidden until it is known.
    chip.orientation = LinearLayout.HORIZONTAL
    chip.gravity = Gravity.CENTER_VERTICAL
    chip.setPadding(dp(SheetMetrics.CHIP_PAD_START), dp(SheetMetrics.CHIP_PAD_V), dp(SheetMetrics.CHIP_PAD_END), dp(SheetMetrics.CHIP_PAD_V))
    chip.background = GradientDrawable().apply {
      setColor(AutofillStyle.CHIP)
      cornerRadius = dp(999).toFloat()
    }
    chip.visibility = View.GONE
    chipIcon.setImageResource(R.drawable.kitevault_ic_lock)
    chipIcon.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    chip.addView(chipIcon, LinearLayout.LayoutParams(dp(SheetMetrics.CHIP_ICON), dp(SheetMetrics.CHIP_ICON)))
    chipText.textSize = SheetMetrics.CHIP_SP
    chipText.setTextColor(AutofillStyle.MUTED)
    chipText.maxLines = 1
    chipText.ellipsize = TextUtils.TruncateAt.END
    chip.addView(chipText, LinearLayout.LayoutParams(WRAP, WRAP).apply { marginStart = dp(SheetMetrics.CHIP_GAP) })
    sheet.addView(
      chip,
      LinearLayout.LayoutParams(WRAP, WRAP).apply {
        topMargin = dp(SheetMetrics.CHIP_TOP)
        bottomMargin = dp(SheetMetrics.CHIP_BOTTOM)
      },
    )

    // The content scrolls when it does not fit (a long list, a small phone, the keyboard open).
    // A scroll view that wraps its content is only as tall as the room left, so nothing is cut off.
    content.orientation = LinearLayout.VERTICAL
    scroller.isVerticalScrollBarEnabled = false
    scroller.overScrollMode = View.OVER_SCROLL_NEVER
    scroller.addView(content, FrameLayout.LayoutParams(MATCH, WRAP))
    sheet.addView(scroller, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(SheetMetrics.CONTENT_TOP) })

    // Keep the sheet clear of the navigation bar and the keyboard.
    root.setOnApplyWindowInsetsListener { _, insets ->
      sheet.setPadding(dp(SheetMetrics.SHEET_SIDE), dp(SheetMetrics.SHEET_TOP), dp(SheetMetrics.SHEET_SIDE), dp(SheetMetrics.SHEET_BOTTOM) + bottomInset(insets))
      insets
    }

    activity.setContentView(root)

    // It slides up and fades in. (If the phone has animations turned off, this is instant.)
    sheet.alpha = 0f
    sheet.translationY = dp(SheetMetrics.SLIDE).toFloat()
    sheet.animate().alpha(1f).translationY(0f).setDuration(260).setInterpolator(DecelerateInterpolator()).start()
  }

  @Suppress("DEPRECATION")
  private fun bottomInset(insets: WindowInsets): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime()).bottom
    } else {
      insets.systemWindowInsetBottom
    }

  /** "Kite" in white and "Vault" in amber. */
  private fun name(): CharSequence {
    val text = SpannableString("KiteVault")
    text.setSpan(ForegroundColorSpan(AutofillStyle.AMBER), 4, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return text
  }

  /**
   * Shows who the sheet is for, for example "shop.example.com". [verified] is true for a web
   * address a trusted browser reported over https (mint lock); anything else is drawn in amber,
   * because for an app the name is only a label.
   */
  fun showContext(displayName: String, verified: Boolean) {
    chipText.text = displayName
    chipIcon.imageTintList = ColorStateList.valueOf(if (verified) AutofillStyle.MINT else AutofillStyle.AMBER)
    chip.visibility = View.VISIBLE
  }

  // --- Screens swap in and out of the content area ----------------------------------------------

  /** Clears the content for the next screen, and fades it in. */
  fun reset() {
    content.removeAllViews()
    scroller.scrollTo(0, 0)
    content.alpha = 0f
    content.animate().alpha(1f).setDuration(140).start()
  }

  private fun add(view: View, bottomDp: Int = 0, topDp: Int = 0) {
    content.addView(
      view,
      LinearLayout.LayoutParams(MATCH, WRAP).apply {
        bottomMargin = dp(bottomDp)
        topMargin = dp(topDp)
      },
    )
  }

  fun title(text: String) {
    add(
      TextView(activity).apply {
        this.text = text
        textSize = SheetMetrics.TITLE_SP
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(AutofillStyle.TEXT)
        letterSpacing = -0.01f
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isAccessibilityHeading = true
      },
      bottomDp = SheetMetrics.TITLE_GAP,
    )
  }

  fun body(text: String) {
    add(
      TextView(activity).apply {
        this.text = text
        textSize = SheetMetrics.BODY_SP
        setLineSpacing(0f, SheetMetrics.BODY_LINE)
        setTextColor(AutofillStyle.MUTED)
      },
      bottomDp = SheetMetrics.BODY_GAP,
    )
  }

  /** A small grey line, for the fine print. */
  fun note(text: String) {
    add(
      TextView(activity).apply {
        this.text = text
        textSize = SheetMetrics.NOTE_SP
        setTextColor(AutofillStyle.MUTED)
      },
      bottomDp = SheetMetrics.NOTE_GAP,
    )
  }

  /** A round icon on a soft circle of the same colour, then a heading and a sentence. */
  fun message(icon: Int, tint: Int, heading: String, sentence: String) {
    val circle =
      FrameLayout(activity).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor((tint and 0x00FFFFFF) or 0x33000000)
        }
        addView(
          ImageView(activity).apply {
            setImageResource(icon)
            imageTintList = ColorStateList.valueOf(tint)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
          },
          FrameLayout.LayoutParams(dp(SheetMetrics.MESSAGE_ICON), dp(SheetMetrics.MESSAGE_ICON), Gravity.CENTER),
        )
      }
    content.addView(circle, LinearLayout.LayoutParams(dp(SheetMetrics.MESSAGE_CIRCLE), dp(SheetMetrics.MESSAGE_CIRCLE)).apply { bottomMargin = dp(SheetMetrics.MESSAGE_GAP) })
    title(heading)
    body(sentence)
  }

  /** A spinner and a short line, while something is happening. */
  fun loading(text: String) {
    val box =
      LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(0, dp(SheetMetrics.LOADING_PAD), 0, dp(SheetMetrics.LOADING_PAD))
      }
    box.addView(
      ProgressBar(activity).apply {
        isIndeterminate = true
        indeterminateTintList = ColorStateList.valueOf(AutofillStyle.AMBER)
      },
      LinearLayout.LayoutParams(dp(SheetMetrics.SPINNER), dp(SheetMetrics.SPINNER)),
    )
    box.addView(
      TextView(activity).apply {
        this.text = text
        textSize = SheetMetrics.LOADING_SP
        gravity = Gravity.CENTER
        setTextColor(AutofillStyle.MUTED)
      },
      LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(SheetMetrics.LOADING_GAP) },
    )
    add(box)
  }

  // --- Buttons and rows ---------------------------------------------------------------------------

  fun button(text: String, kind: ButtonKind, onClick: () -> Unit) {
    val (fill, label) =
      when (kind) {
        ButtonKind.PRIMARY -> AutofillStyle.AMBER to AutofillStyle.ON_AMBER
        ButtonKind.DANGER -> AutofillStyle.CORAL to AutofillStyle.ON_AMBER
        ButtonKind.SECONDARY -> AutofillStyle.CHIP to AutofillStyle.TEXT
        ButtonKind.TEXT -> Color.TRANSPARENT to AutofillStyle.MUTED
      }
    val radius = dp(SheetMetrics.BUTTON_RADIUS).toFloat()
    val shape = { GradientDrawable().apply { setColor(fill); cornerRadius = radius } }
    val mask = GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = radius }
    add(
      Button(activity).apply {
        this.text = text
        isAllCaps = false
        textSize = SheetMetrics.BUTTON_SP
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(label)
        stateListAnimator = null
        background = RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), shape(), mask)
        minHeight = dp(SheetMetrics.BUTTON_H)
        minimumHeight = dp(SheetMetrics.BUTTON_H)
        setPadding(dp(SheetMetrics.BUTTON_PAD), 0, dp(SheetMetrics.BUTTON_PAD), 0)
        setOnClickListener { onClick() }
      },
      bottomDp = if (kind == ButtonKind.TEXT) 0 else SheetMetrics.BUTTON_GAP,
    )
  }

  /** A login in a list: a coloured letter, the title, the user name, and an arrow. */
  fun loginRow(title: String, username: String, onClick: () -> Unit): View {
    val row =
      LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(SheetMetrics.ROW_PAD), dp(SheetMetrics.ROW_PAD), dp(SheetMetrics.ROW_PAD), dp(SheetMetrics.ROW_PAD))
        minimumHeight = dp(SheetMetrics.ROW_MIN)
        isClickable = true
        isFocusable = true
        background = RippleDrawable(
          ColorStateList.valueOf(0x33FFFFFF),
          GradientDrawable().apply { setColor(AutofillStyle.ROW); cornerRadius = dp(SheetMetrics.ROW_RADIUS).toFloat() },
          GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = dp(SheetMetrics.ROW_RADIUS).toFloat() },
        )
        setOnClickListener { onClick() }
      }

    val hue = AutofillStyle.avatarHue(title).toFloat()
    row.addView(
      FrameLayout(activity).apply {
        background = GradientDrawable().apply {
          setColor(Color.HSVToColor(floatArrayOf(hue, 0.5f, 0.62f)))
          cornerRadius = dp(SheetMetrics.AVATAR_RADIUS).toFloat()
        }
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        addView(
          TextView(activity).apply {
            text = AutofillStyle.avatarLetter(title)
            textSize = SheetMetrics.AVATAR_SP
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
          },
          FrameLayout.LayoutParams(MATCH, MATCH),
        )
      },
      LinearLayout.LayoutParams(dp(SheetMetrics.AVATAR), dp(SheetMetrics.AVATAR)),
    )

    val texts = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    texts.addView(
      TextView(activity).apply {
        text = title
        textSize = SheetMetrics.ROW_TITLE_SP
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(AutofillStyle.TEXT)
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
      },
    )
    if (username.isNotEmpty()) {
      texts.addView(
        TextView(activity).apply {
          text = username
          textSize = SheetMetrics.ROW_SUB_SP
          setTextColor(AutofillStyle.MUTED)
          maxLines = 1
          ellipsize = TextUtils.TruncateAt.END
        },
      )
    }
    row.addView(texts, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = dp(SheetMetrics.ROW_TEXT_GAP) })

    row.addView(
      ImageView(activity).apply {
        setImageResource(R.drawable.kitevault_ic_chevron)
        imageTintList = ColorStateList.valueOf(AutofillStyle.MUTED)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      },
      LinearLayout.LayoutParams(dp(SheetMetrics.CHEVRON), dp(SheetMetrics.CHEVRON)),
    )
    return row
  }

  /** Adds a row made by [loginRow] to the content, with a gap under it. */
  fun addRow(row: View) = add(row, bottomDp = SheetMetrics.ROW_GAP)

  // --- The password -------------------------------------------------------------------------------

  /** The generated password in a dark box, letters plain, digits amber and symbols coral. */
  fun passwordBox(password: String): TextView {
    val box =
      TextView(activity).apply {
        typeface = Typeface.MONOSPACE
        textSize = SheetMetrics.PASSWORD_SP
        gravity = Gravity.CENTER
        letterSpacing = 0.04f
        setLineSpacing(0f, 1.2f)
        setPadding(dp(SheetMetrics.PASSWORD_PAD_H), dp(SheetMetrics.PASSWORD_PAD_V), dp(SheetMetrics.PASSWORD_PAD_H), dp(SheetMetrics.PASSWORD_PAD_V))
        background = GradientDrawable().apply {
          setColor(AutofillStyle.FIELD)
          cornerRadius = dp(SheetMetrics.PASSWORD_RADIUS).toFloat()
        }
      }
    setPassword(box, password)
    add(box, bottomDp = SheetMetrics.PASSWORD_GAP)
    return box
  }

  fun setPassword(box: TextView, password: String) {
    val colored = SpannableString(password)
    for (i in password.indices) {
      colored.setSpan(
        ForegroundColorSpan(AutofillStyle.colorOf(password[i])),
        i,
        i + 1,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }
    box.text = colored
  }

  /** The line under the password: a green tick, how long it is, and what is in it. */
  fun passwordSummary(password: String): TextView {
    val line =
      TextView(activity).apply {
        text = AutofillStyle.passwordSummary(password)
        textSize = SheetMetrics.SUMMARY_SP
        setTextColor(AutofillStyle.MINT)
        gravity = Gravity.CENTER
      }
    add(line, bottomDp = SheetMetrics.SUMMARY_GAP)
    return line
  }

  /**
   * The choices for the password: four lengths, and symbols on or off. [onChange] gets the new
   * choice every time one is tapped. Many sign-up pages cap the length or refuse symbols.
   */
  fun passwordOptions(initial: PasswordOptions, onChange: (PasswordOptions) -> Unit) {
    var current = initial
    val box = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }

    box.addView(smallLabel("Length"))
    val lengthRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
    val lengthChips = PasswordGenerator.LENGTH_CHOICES.map { it to optionChip() }
    for ((i, pair) in lengthChips.withIndex()) {
      lengthRow.addView(
        pair.second,
        LinearLayout.LayoutParams(0, dp(SheetMetrics.OPTION_H), 1f).apply { if (i > 0) marginStart = dp(SheetMetrics.OPTION_ROW_GAP) },
      )
    }
    box.addView(
      lengthRow,
      LinearLayout.LayoutParams(MATCH, WRAP).apply {
        topMargin = dp(SheetMetrics.OPTION_LABEL_GAP)
        bottomMargin = dp(SheetMetrics.OPTION_GAP * 2)
      },
    )

    val symbolsRow = LinearLayout(activity).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    symbolsRow.addView(smallLabel("Symbols  ! @ # \$ %"), LinearLayout.LayoutParams(0, WRAP, 1f))
    val symbolsChip = optionChip()
    symbolsRow.addView(symbolsChip, LinearLayout.LayoutParams(dp(SheetMetrics.SYMBOLS_W), dp(SheetMetrics.OPTION_H)))
    box.addView(symbolsRow, LinearLayout.LayoutParams(MATCH, WRAP))

    fun refresh() {
      for ((n, chip) in lengthChips) {
        val on = n == current.length
        styleChip(chip, on)
        chip.text = n.toString()
        chip.contentDescription = "$n characters" + if (on) ", selected" else ""
      }
      styleChip(symbolsChip, current.symbols)
      symbolsChip.text = if (current.symbols) "On" else "Off"
      symbolsChip.contentDescription = if (current.symbols) "Symbols, on" else "Symbols, off"
    }
    for ((n, chip) in lengthChips) {
      chip.setOnClickListener {
        current = current.copy(length = n)
        refresh()
        onChange(current)
      }
    }
    symbolsChip.setOnClickListener {
      current = current.copy(symbols = !current.symbols)
      refresh()
      onChange(current)
    }
    refresh()
    add(box, bottomDp = SheetMetrics.OPTIONS_BOTTOM)
  }

  private fun smallLabel(text: String): TextView =
    TextView(activity).apply {
      this.text = text
      textSize = SheetMetrics.OPTION_LABEL_SP
      setTextColor(AutofillStyle.MUTED)
    }

  private fun optionChip(): TextView =
    TextView(activity).apply {
      gravity = Gravity.CENTER
      textSize = SheetMetrics.OPTION_SP
      typeface = Typeface.DEFAULT_BOLD
      isClickable = true
      isFocusable = true
    }

  /** Amber when chosen, blue-grey when not. */
  private fun styleChip(chip: TextView, on: Boolean) {
    chip.background = GradientDrawable().apply {
      setColor(if (on) AutofillStyle.AMBER else AutofillStyle.CHIP)
      cornerRadius = dp(SheetMetrics.OPTION_RADIUS).toFloat()
    }
    chip.setTextColor(if (on) AutofillStyle.ON_AMBER else AutofillStyle.TEXT)
  }

  // --- Search ---------------------------------------------------------------------------------------

  fun searchField(hint: String, watcher: TextWatcher): EditText {
    val field =
      EditText(activity).apply {
        this.hint = hint
        setHintTextColor(AutofillStyle.MUTED)
        setTextColor(AutofillStyle.TEXT)
        textSize = SheetMetrics.SEARCH_SP
        inputType = InputType.TYPE_CLASS_TEXT
        setSingleLine()
        setPadding(dp(SheetMetrics.SEARCH_PAD_H), dp(SheetMetrics.SEARCH_PAD_V), dp(SheetMetrics.SEARCH_PAD_H), dp(SheetMetrics.SEARCH_PAD_V))
        background = GradientDrawable().apply {
          setColor(AutofillStyle.FIELD)
          cornerRadius = dp(SheetMetrics.SEARCH_RADIUS).toFloat()
        }
        addTextChangedListener(watcher)
      }
    add(field, bottomDp = SheetMetrics.SEARCH_GAP)
    return field
  }

  /** The column to put a list of rows into. The whole sheet scrolls, so the list needs no scroller. */
  fun list(): LinearLayout {
    val column = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    content.addView(column, LinearLayout.LayoutParams(MATCH, WRAP).apply { bottomMargin = dp(SheetMetrics.ROW_GAP) })
    return column
  }

  fun emptyLine(text: String): TextView =
    TextView(activity).apply {
      this.text = text
      textSize = SheetMetrics.EMPTY_SP
      gravity = Gravity.CENTER
      setPadding(0, dp(SheetMetrics.EMPTY_PAD), 0, dp(SheetMetrics.EMPTY_PAD))
      setTextColor(AutofillStyle.MUTED)
    }

  private companion object {
    const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
  }
}
