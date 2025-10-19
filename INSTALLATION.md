# Installation
Here are all the ways of installing/using CrypthoraChat depending on your needs and devices os.

**Operating System:**
&emsp;**[Desktop (Windows, macOs, Linux)](#desktop-windows-macos-linux)**
&emsp;**[Android](#android)**
&emsp;**[IOS](#ios)**
&emsp;**[Other](#browser)**

## Desktop (Windows, macOs, Linux)
If you want to install the Web app just like a normal app (with its own window and icon on the dock and desktop) you can follow:
1. Go to the domain your CrypthoraChat instance is hosted on in a Chromium based browser (eg Chrome, Brave, Edge etc)
2. Allow notification permissions and find the button to install (top left near the bookmark icon in most browsers)
3. Now you have CrypthoraChat just like any other app on your pc and can place the shortcut anywhere

## Android
On Android you have two options:
### Wrapper app (Recommended)
The wrapper app has several advantages over just installing the PWA. Manly always receiving push notifications even after the phone goes into doze mode (after 30min screen off an being stationary), notifications having the actual app icon everywhere, the app feeling more native and some other things. To install it follow:
1. Install the ntfy app ([F-Droid](https://f-droid.org/packages/io.heckel.ntfy/), [GitHub](https://github.com/binwiederhier/ntfy-android/releases/latest) or from Play Store)
2. Open it, tap on the three dots in the top right, open settings and change the default server to your ntfy server. Also change connection protocol to websockets
3. Go into the apps settings/app info (hold down icon > app info). Tap on battery usage > background usage and set it to unrestricted (options may be called different depending on you phone)
4. Now download and install the latest `apk` of the [wrapper app](https://github.com/Mauznemo/CrypthoraChatWrapper/releases/latest)
5. Open it and give it all permission it needs
6. Input your CrypthoraChat url (push provider should show ntfy, if not somethings is wrong) and tap save
If you even want to change the server inside of CrypthoraChat g expand the side drawer, tap the gear and click on "Wrapper Settings"

### PWA
You can also, just like on Desktop, install the PWA to yor phone if you don't care about the benefits of the wrapper version (you will still get all notification you missed while the phone was in doze mode the next time you unlock it).
1. Go to the domain your CrypthoraChat instance is hosted on in a Chromium based browser (eg Chrome, Brave, Edge etc)
2. Allow notification permissions and find the button to install (in the top left click the three dots > Add to home screen > install)
3. Now you have CrypthoraChat just like any other app on your home screen

## IOS
On iOS you can also install the PWA version, but it also will stop sending push notification after a while of inactivity until you unlock it again.
1. Go to the domain your CrypthoraChat instance is hosted on in Safari
2. Tap the Share button in the bottom menu bar and select Add to Home Screen
3. Now you have CrypthoraChat just like any other app on your home screen (You might need to allow notification permissions on first open)

## Browser
If none of the option above are possible for you, you can also just use it in any Browser.