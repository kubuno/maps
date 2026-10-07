package com.kubuno.maps

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.kubuno.android.account.AccountCallFactory
import com.kubuno.android.account.AccountManagerBridge
import dagger.hilt.android.HiltAndroidApp
import org.maplibre.android.MapLibre
import javax.inject.Inject

@HiltAndroidApp
class KubunoMapsApp : Application(), SingletonImageLoader.Factory {

    @Inject lateinit var accountBridge: AccountManagerBridge
    @Inject lateinit var callFactory: AccountCallFactory

    override fun onCreate() {
        super.onCreate()
        // Keep the system accounts in step with ours, exactly like the drive and
        // mail apps: whichever app the user opens keeps the shared list current.
        accountBridge.install()
        // MapLibre must be initialised once, before any MapView is inflated.
        MapLibre.getInstance(this)
    }

    /** Place photos ride each account's authenticated client, chosen per URL. */
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(callFactory = { callFactory }))
            }
            .build()
}
