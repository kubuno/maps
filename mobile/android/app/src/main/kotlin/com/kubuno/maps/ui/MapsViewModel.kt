package com.kubuno.maps.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kubuno.android.account.SharedAccount
import com.kubuno.android.account.SharedAccounts
import com.kubuno.maps.net.MapsClients
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Base map styles, keyless OpenStreetMap-derived, mirroring the web module. */
object MapStyles {
    // The web's default base map (maps/frontend/src/mapsLayers.ts). The backend's
    // /config style_url defaults to a localhost tileserver that a phone can't
    // reach, so we use the same public vector style the web does and take only
    // the centre/zoom from /config.
    const val LIBERTY = "https://tiles.openfreemap.org/styles/liberty"
    const val POSITRON = "https://tiles.openfreemap.org/styles/positron"
}

/** What the map needs to first render: which account, where to look, how close. */
data class MapsUiState(
    val account: SharedAccount? = null,
    val ready: Boolean = false,
    val centerLat: Double = PARIS_LAT,
    val centerLng: Double = PARIS_LNG,
    val zoom: Double = DEFAULT_ZOOM,
    val styleUrl: String = MapStyles.LIBERTY,
) {
    companion object {
        const val PARIS_LAT = 48.8566
        const val PARIS_LNG = 2.3522
        const val DEFAULT_ZOOM = 12.0
    }
}

@HiltViewModel
class MapsViewModel @Inject constructor(
    sharedAccounts: SharedAccounts,
    private val clients: MapsClients,
) : ViewModel() {

    /** The shared Kubuno accounts this device knows; maps is a pure consumer. */
    val accounts: List<SharedAccount> = sharedAccounts.list()

    private val _state = MutableStateFlow(MapsUiState(account = accounts.firstOrNull()))
    val state: StateFlow<MapsUiState> = _state.asStateFlow()

    init {
        loadConfig()
    }

    /** Pull the instance's default view; never fatal — Paris/zoom-12 is the fallback. */
    private fun loadConfig() {
        val account = _state.value.account ?: run {
            _state.value = _state.value.copy(ready = true)
            return
        }
        viewModelScope.launch {
            val config = withContext(Dispatchers.IO) {
                runCatching { clients.api(account).getConfig() }.getOrNull()
            }
            _state.value = _state.value.copy(
                ready = true,
                centerLat = config?.defaultLat ?: MapsUiState.PARIS_LAT,
                centerLng = config?.defaultLng ?: MapsUiState.PARIS_LNG,
                zoom = config?.defaultZoom ?: MapsUiState.DEFAULT_ZOOM,
            )
        }
    }
}
