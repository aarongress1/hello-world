package com.curiokids.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * A thin WebView wrapper around the CurioKids web app. The URL it loads is set in
 * res/values/strings.xml (app_url). This gives you a real, installable Android
 * app without rebuilding the UI — ideal for a family pilot on Android tablets.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

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
