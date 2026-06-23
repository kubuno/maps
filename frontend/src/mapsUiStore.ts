import { create } from 'zustand'

// Onglet actif du module Maps. Partagé entre la nav de la sidebar du core
// (MapsSidebarBody) et le panneau flottant de MapsPage : cliquer un élément de la
// sidebar change l'onglet, et le panneau (recherche / lieux / GPX / itinéraire)
// se met à jour. Auparavant cet état était local à MapsPage (rail flottant).
export type MapsTab = 'search' | 'places' | 'gpx' | 'route' | 'sketch'

interface MapsUiState {
  tab:    MapsTab
  setTab: (tab: MapsTab) => void
}

export const useMapsUiStore = create<MapsUiState>((set) => ({
  tab:    'search',
  setTab: (tab) => set({ tab }),
}))
