package com.kubuno.maps.net

import com.kubuno.android.account.BrokeredClient
import com.kubuno.android.account.BrokeredClients
import com.kubuno.android.account.SharedAccount
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Builds a [MapsApi] per shared account, over the account's borrowed-token
 * client. Like the mail app, maps is a consumer: it never holds a refresh
 * token, it talks to each instance through the client :core-account brokers.
 */
@Singleton
class MapsClients @Inject constructor(
    private val brokered: BrokeredClients,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
    private val apis = ConcurrentHashMap<String, MapsApi>()

    fun api(account: SharedAccount): MapsApi = apis.computeIfAbsent(account.systemName) {
        val client = brokered.of(account)
        Retrofit.Builder()
            .baseUrl(client.serverUrl + "/")
            .client(client.okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MapsApi::class.java)
    }

    /** The authenticated client itself, for tile/photo byte streams. */
    fun raw(account: SharedAccount): BrokeredClient = brokered.of(account)
}
