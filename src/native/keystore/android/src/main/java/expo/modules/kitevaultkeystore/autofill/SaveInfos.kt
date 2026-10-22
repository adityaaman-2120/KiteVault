package expo.modules.kitevaultkeystore.autofill

import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId

/**
 * Builds the note that tells Android "after the user submits this form, offer to save it".
 *
 * In simple words: Android only shows its "Save to KiteVault?" question if the autofill service
 * said, when the form first appeared, which boxes matter. The password box is required (no
 * password typed, no question); the user-name box is optional (some sign-ins have none).
 */
internal object SaveInfos {
  fun forForm(passwordId: AutofillId, usernameId: AutofillId?): SaveInfo {
    val builder =
      SaveInfo.Builder(
        SaveInfo.SAVE_DATA_TYPE_PASSWORD or SaveInfo.SAVE_DATA_TYPE_USERNAME,
        arrayOf(passwordId),
      )
    if (usernameId != null) builder.setOptionalIds(arrayOf(usernameId))
    return builder.build()
  }
}
