// The services whose icon KiteVault shows instead of a plain letter. Everything here is matched
// on the phone, offline: by the web address of the login, by the Android app's package name, or by
// an exact title (see src/features/icons/brandMatch.ts).
//
//   slug     name of the glyph in the Simple Icons set (CC0). Leave it out for a brand that is not in
//            that set (Simple Icons removed some at their owners' request): it then gets a tile in
//            the brand's colour with its first letter, and `hex` must be given.
//   name     display name, also matched against an entry's exact title.
//   domains  web addresses. A match on a parent also covers every subdomain (amazon.in covers
//            www.amazon.in). Never list a domain that belongs to many different owners (for example
//            herokuapp.com, github.io, blogspot.com).
//   packages Android package names (for logins linked to an app).
//   aliases  other exact titles, lower case.
//
// To add a service: add a line, then run `npm run brand-icons` (see scripts/build-brand-icons.js).

module.exports = [
  // --- Google and friends
  { slug: 'google', name: 'Google', domains: ['google.com', 'google.co.in', 'google.co.uk', 'google.ca', 'google.com.au', 'google.de', 'google.fr'], packages: ['com.google.android.googlequicksearchbox'] },
  { slug: 'gmail', name: 'Gmail', domains: ['mail.google.com', 'gmail.com'], packages: ['com.google.android.gm'] },
  { slug: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be'], packages: ['com.google.android.youtube'] },
  { slug: 'googledrive', name: 'Google Drive', domains: ['drive.google.com'], packages: ['com.google.android.apps.docs'] },
  { slug: 'googlepay', name: 'Google Pay', domains: ['pay.google.com'], packages: ['com.google.android.apps.nbu.paisa.user'], aliases: ['gpay'] },
  { slug: 'googlecloud', name: 'Google Cloud', domains: ['cloud.google.com', 'console.cloud.google.com'] },
  { slug: 'googlechrome', name: 'Chrome', domains: [], packages: ['com.android.chrome'], aliases: ['google chrome'] },
  // --- Social and messaging
  { slug: 'facebook', name: 'Facebook', domains: ['facebook.com', 'fb.com'], packages: ['com.facebook.katana'] },
  { slug: 'instagram', name: 'Instagram', domains: ['instagram.com'], packages: ['com.instagram.android'] },
  { slug: 'whatsapp', name: 'WhatsApp', domains: ['whatsapp.com'], packages: ['com.whatsapp', 'com.whatsapp.w4b'] },
  { slug: 'messenger', name: 'Messenger', domains: ['messenger.com'], packages: ['com.facebook.orca'] },
  { slug: 'threads', name: 'Threads', domains: ['threads.net', 'threads.com'], packages: ['com.instagram.barcelona'] },
  { slug: 'x', name: 'X', domains: ['x.com', 'twitter.com'], packages: ['com.twitter.android'], aliases: ['twitter'] },
  { name: 'LinkedIn', hex: '#0A66C2', domains: ['linkedin.com'], packages: ['com.linkedin.android'] },
  { slug: 'reddit', name: 'Reddit', domains: ['reddit.com'], packages: ['com.reddit.frontpage'] },
  { slug: 'discord', name: 'Discord', domains: ['discord.com', 'discord.gg'], packages: ['com.discord'] },
  { slug: 'telegram', name: 'Telegram', domains: ['telegram.org', 't.me'], packages: ['org.telegram.messenger'] },
  { slug: 'snapchat', name: 'Snapchat', domains: ['snapchat.com'], packages: ['com.snapchat.android'] },
  { slug: 'pinterest', name: 'Pinterest', domains: ['pinterest.com', 'pinterest.in'], packages: ['com.pinterest'] },
  { slug: 'tiktok', name: 'TikTok', domains: ['tiktok.com'], packages: ['com.zhiliaoapp.musically'] },
  { slug: 'twitch', name: 'Twitch', domains: ['twitch.tv'], packages: ['tv.twitch.android.app'] },
  { slug: 'tumblr', name: 'Tumblr', domains: ['tumblr.com'] },
  { slug: 'medium', name: 'Medium', domains: ['medium.com'] },
  { slug: 'quora', name: 'Quora', domains: ['quora.com'] },
  { slug: 'tinder', name: 'Tinder', domains: ['tinder.com'] },
  { name: 'Bumble', hex: '#FFC629', domains: ['bumble.com'] },
  // --- Streaming
  { slug: 'netflix', name: 'Netflix', domains: ['netflix.com'], packages: ['com.netflix.mediaclient'] },
  { slug: 'spotify', name: 'Spotify', domains: ['spotify.com'], packages: ['com.spotify.music'] },
  { name: 'Disney+', hex: '#113CCF', domains: ['disneyplus.com'], aliases: ['disney plus'] },
  { name: 'Prime Video', hex: '#00A8E1', domains: ['primevideo.com'], packages: ['com.amazon.avod.thirdpartyclient'] },
  // --- Shopping
  { name: 'Amazon', hex: '#FF9900', domains: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de', 'amazon.ca', 'amazon.co.jp', 'amazon.com.au', 'amazon.fr', 'amazon.es', 'amazon.it', 'amazon.sg', 'amazon.ae'], packages: ['in.amazon.mShop.android.shopping', 'com.amazon.mShop.android.shopping'] },
  { slug: 'ebay', name: 'eBay', domains: ['ebay.com', 'ebay.in', 'ebay.co.uk'] },
  { slug: 'aliexpress', name: 'AliExpress', domains: ['aliexpress.com'] },
  { slug: 'etsy', name: 'Etsy', domains: ['etsy.com'] },
  { slug: 'shopify', name: 'Shopify', domains: ['shopify.com'] },
  { name: 'Walmart', hex: '#0071CE', domains: ['walmart.com'] },
  // --- Microsoft, Apple
  { name: 'Microsoft', hex: '#00A4EF', domains: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'azure.com', 'bing.com'], packages: ['com.microsoft.office.officehubrow'] },
  { name: 'Outlook', hex: '#0078D4', domains: ['outlook.com', 'outlook.live.com', 'hotmail.com'], packages: ['com.microsoft.office.outlook'] },
  { name: 'OneDrive', hex: '#0078D4', domains: ['onedrive.live.com'], packages: ['com.microsoft.skydrive'] },
  { slug: 'apple', name: 'Apple', domains: ['apple.com'] },
  { slug: 'icloud', name: 'iCloud', domains: ['icloud.com'] },
  // --- Developer
  { slug: 'github', name: 'GitHub', domains: ['github.com'], packages: ['com.github.android'] },
  { slug: 'gitlab', name: 'GitLab', domains: ['gitlab.com'] },
  { slug: 'bitbucket', name: 'Bitbucket', domains: ['bitbucket.org'] },
  { slug: 'stackoverflow', name: 'Stack Overflow', domains: ['stackoverflow.com'] },
  { slug: 'npm', name: 'npm', domains: ['npmjs.com'] },
  { slug: 'docker', name: 'Docker', domains: ['docker.com'] },
  { slug: 'cloudflare', name: 'Cloudflare', domains: ['cloudflare.com'] },
  { slug: 'digitalocean', name: 'DigitalOcean', domains: ['digitalocean.com'] },
  { slug: 'vercel', name: 'Vercel', domains: ['vercel.com'] },
  { slug: 'netlify', name: 'Netlify', domains: ['netlify.com'] },
  { name: 'Heroku', hex: '#430098', domains: ['heroku.com'] },
  { slug: 'wordpress', name: 'WordPress', domains: ['wordpress.com', 'wordpress.org'] },
  // --- Work and tools
  { slug: 'notion', name: 'Notion', domains: ['notion.so', 'notion.com'], packages: ['notion.id'] },
  { name: 'Slack', hex: '#4A154B', domains: ['slack.com'], packages: ['com.Slack'] },
  { slug: 'zoom', name: 'Zoom', domains: ['zoom.us', 'zoom.com'], packages: ['us.zoom.videomeetings'] },
  { slug: 'dropbox', name: 'Dropbox', domains: ['dropbox.com'], packages: ['com.dropbox.android'] },
  { name: 'Canva', hex: '#00C4CC', domains: ['canva.com'] },
  { slug: 'figma', name: 'Figma', domains: ['figma.com'] },
  { slug: 'trello', name: 'Trello', domains: ['trello.com'] },
  { slug: 'asana', name: 'Asana', domains: ['asana.com'] },
  { slug: 'atlassian', name: 'Atlassian', domains: ['atlassian.com', 'atlassian.net'] },
  { name: 'Adobe', hex: '#FF0000', domains: ['adobe.com'] },
  { slug: 'evernote', name: 'Evernote', domains: ['evernote.com'] },
  // --- AI
  { name: 'OpenAI', hex: '#412991', domains: ['openai.com', 'chatgpt.com'], aliases: ['chatgpt'] },
  { slug: 'anthropic', name: 'Anthropic', domains: ['anthropic.com', 'claude.ai'], aliases: ['claude'] },
  // --- Security and privacy
  { slug: 'proton', name: 'Proton', domains: ['proton.me', 'protonmail.com', 'protonvpn.com'] },
  { slug: 'nordvpn', name: 'NordVPN', domains: ['nordvpn.com'] },
  { slug: 'expressvpn', name: 'ExpressVPN', domains: ['expressvpn.com'] },
  { slug: 'bitwarden', name: 'Bitwarden', domains: ['bitwarden.com'] },
  { slug: '1password', name: '1Password', domains: ['1password.com'] },
  { slug: 'lastpass', name: 'LastPass', domains: ['lastpass.com'] },
  { slug: 'dashlane', name: 'Dashlane', domains: ['dashlane.com'] },
  // --- Money
  { slug: 'paypal', name: 'PayPal', domains: ['paypal.com', 'paypal.me'], packages: ['com.paypal.android.p2pmobile'] },
  { slug: 'stripe', name: 'Stripe', domains: ['stripe.com'] },
  { slug: 'wise', name: 'Wise', domains: ['wise.com'] },
  { slug: 'revolut', name: 'Revolut', domains: ['revolut.com'] },
  { slug: 'coinbase', name: 'Coinbase', domains: ['coinbase.com'] },
  { slug: 'binance', name: 'Binance', domains: ['binance.com'] },
  // --- Games
  { slug: 'steam', name: 'Steam', domains: ['steampowered.com', 'steamcommunity.com'] },
  { slug: 'epicgames', name: 'Epic Games', domains: ['epicgames.com'] },
  { slug: 'playstation', name: 'PlayStation', domains: ['playstation.com'] },
  { name: 'Xbox', hex: '#107C10', domains: ['xbox.com'] },
  { name: 'Nintendo', hex: '#E60012', domains: ['nintendo.com'] },
  { slug: 'roblox', name: 'Roblox', domains: ['roblox.com'] },
  // --- Travel and rides
  { slug: 'airbnb', name: 'Airbnb', domains: ['airbnb.com', 'airbnb.co.in'] },
  { slug: 'uber', name: 'Uber', domains: ['uber.com'], packages: ['com.ubercab'] },
  { name: 'Booking.com', hex: '#003B95', domains: ['booking.com'] },
  { slug: 'tripadvisor', name: 'Tripadvisor', domains: ['tripadvisor.com'] },
  // --- Learning
  { slug: 'duolingo', name: 'Duolingo', domains: ['duolingo.com'] },
  { slug: 'coursera', name: 'Coursera', domains: ['coursera.org'] },
  { slug: 'udemy', name: 'Udemy', domains: ['udemy.com'] },
  { slug: 'khanacademy', name: 'Khan Academy', domains: ['khanacademy.org'] },
  // --- Phones and telecom
  { slug: 'samsung', name: 'Samsung', domains: ['samsung.com'] },
  { slug: 'xiaomi', name: 'Xiaomi', domains: ['mi.com', 'xiaomi.com'] },
  { slug: 'oneplus', name: 'OnePlus', domains: ['oneplus.com'] },
  { slug: 'vodafone', name: 'Vodafone', domains: ['vodafone.com'] },
  { name: 'Yahoo', hex: '#6001D2', domains: ['yahoo.com'] },
  // --- India
  { name: 'Flipkart', hex: '#2874F0', domains: ['flipkart.com'], packages: ['com.flipkart.android'] },
  { slug: 'paytm', name: 'Paytm', domains: ['paytm.com'], packages: ['net.one97.paytm'] },
  { slug: 'phonepe', name: 'PhonePe', domains: ['phonepe.com'], packages: ['com.phonepe.app'] },
  { slug: 'zomato', name: 'Zomato', domains: ['zomato.com'], packages: ['com.application.zomato'] },
  { slug: 'swiggy', name: 'Swiggy', domains: ['swiggy.com'], packages: ['in.swiggy.android'] },
  { slug: 'jio', name: 'Jio', domains: ['jio.com'], packages: ['com.jio.myjio'] },
  { slug: 'airtel', name: 'Airtel', domains: ['airtel.in'], packages: ['com.myairtelapp'] },
  { slug: 'razorpay', name: 'Razorpay', domains: ['razorpay.com'] },
  { slug: 'zerodha', name: 'Zerodha', domains: ['zerodha.com'] },
  { name: 'Groww', hex: '#00D09C', domains: ['groww.in'], packages: ['com.nextbillion.groww'] },
  { slug: 'hdfcbank', name: 'HDFC Bank', domains: ['hdfcbank.com'] },
  { slug: 'icicibank', name: 'ICICI Bank', domains: ['icicibank.com'] },
  { slug: 'axisbank', name: 'Axis Bank', domains: ['axisbank.com'] },
  { name: 'Myntra', hex: '#FF3F6C', domains: ['myntra.com'] },
  { name: 'Nykaa', hex: '#FC2779', domains: ['nykaa.com'] },
  { slug: 'bookmyshow', name: 'BookMyShow', domains: ['bookmyshow.com'] },
];
