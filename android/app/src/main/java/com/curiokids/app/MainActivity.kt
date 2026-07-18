package com.curiokids.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * A thin WebView wrapper around the CurioKids web app. The URL it loads is set in
 * res/values/strings.xml (app_url). This gives you a real, installable Android
 * app without rebuilding the UI — ideal for a family pilot on Android tablets.
 *
 * Microphone note: the web page can only access the mic from a secure context,
 * so point app_url at your https link (e.g. the Cloudflare tunnel) — not a plain
 * http LAN address — if you want voice input to work.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // The web page's pending mic request, held while we ask Android for the
    // RECORD_AUDIO runtime permission.
    private var pendingPermissionRequest: PermissionRequest? = null

    private val micPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingPermissionRequest
            pendingPermissionRequest = null
            if (request != null) {
                if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else request.deny()
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true          // the app is a JS SPA
            domStorageEnabled = true          // localStorage / sessionStorage
            mediaPlaybackRequiresUserGesture = false
        }

        // Keep the parent's login session across launches.
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Keep navigation inside the app (don't kick out to a browser).
        webView.webViewClient = WebViewClient()

        // Bridge web mic requests (getUserMedia) to the Android permission system.
        // Without this, WebView silently denies every mic request and the kid
        // can't talk to Curio. Audio only — camera/screen requests are denied.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                if (!request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    request.deny()
                    return
                }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED
                ) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pendingPermissionRequest = request
                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(getString(R.string.app_url))
        } else {
            webView.restoreState(savedInstanceState)
        }

        // Android back button walks the web history first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
