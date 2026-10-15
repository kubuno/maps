//! The offline sample dataset the app shows without a server (`--sample`).
//!
//! A tiny set of saved places so the first desktop increment renders something recognisable before the live
//! REST path (saved places / routes / sketches from the Maps server) is wired in. Pure data.

use kubuno_maps_core::geo::LngLat;

/// A saved place (a pin with a name), the shape the web's `useSavedPlaces` stores.
#[derive(Debug, Clone, PartialEq)]
pub struct SamplePlace {
    pub name: &'static str,
    pub location: LngLat,
}

/// A handful of well-known places, for the offline sample view.
pub fn places() -> Vec<SamplePlace> {
    vec![
        SamplePlace { name: "Tour Eiffel", location: [2.2945, 48.8584] },
        SamplePlace { name: "Notre-Dame de Paris", location: [2.3499, 48.8530] },
        SamplePlace { name: "Musée du Louvre", location: [2.3376, 48.8606] },
    ]
}

/// A searchable place of the offline sample.
#[derive(Debug, Clone, PartialEq)]
pub struct GazetteerEntry {
    pub name: &'static str,
    /// The rest of the address.
    pub detail: &'static str,
    pub category: &'static str,
    pub location: LngLat,
}

/// The places the offline sample can find: well-known places of Paris and a few French cities (real coordinates).
pub fn gazetteer() -> Vec<GazetteerEntry> {
    let g = |name, detail, category, location| GazetteerEntry { name, detail, category, location };
    vec![
        g("Tour Eiffel", "Champ de Mars, 5 avenue Anatole France, 75007 Paris", "tower", [2.2945, 48.8584]),
        g("Musée du Louvre", "Rue de Rivoli, 75001 Paris", "museum", [2.3376, 48.8606]),
        g("Notre-Dame de Paris", "6 parvis Notre-Dame, 75004 Paris", "cathedral", [2.3499, 48.8530]),
        g("Arc de Triomphe", "Place Charles de Gaulle, 75008 Paris", "monument", [2.2950, 48.8738]),
        g("Sacré-Cœur", "35 rue du Chevalier de la Barre, 75018 Paris", "church", [2.3431, 48.8867]),
        g("Centre Pompidou", "Place Georges-Pompidou, 75004 Paris", "museum", [2.3522, 48.8606]),
        g("Musée d'Orsay", "1 rue de la Légion d'Honneur, 75007 Paris", "museum", [2.3266, 48.8600]),
        g("Panthéon", "Place du Panthéon, 75005 Paris", "monument", [2.3462, 48.8462]),
        g("Jardin du Luxembourg", "75006 Paris", "park", [2.3372, 48.8462]),
        g("Place de la Bastille", "75011 Paris", "square", [2.3690, 48.8532]),
        g("Gare du Nord", "18 rue de Dunkerque, 75010 Paris", "station", [2.3553, 48.8809]),
        g("Gare de Lyon", "Place Louis-Armand, 75012 Paris", "station", [2.3735, 48.8443]),
        g("Opéra Garnier", "Place de l'Opéra, 75009 Paris", "theatre", [2.3316, 48.8720]),
        g("Bois de Vincennes", "75012 Paris", "park", [2.4330, 48.8283]),
        g("Lyon", "Auvergne-Rhône-Alpes, France", "city", [4.8357, 45.7640]),
        g("Marseille", "Provence-Alpes-Côte d'Azur, France", "city", [5.3698, 43.2965]),
        g("Bordeaux", "Nouvelle-Aquitaine, France", "city", [-0.5792, 44.8378]),
        g("Lille", "Hauts-de-France, France", "city", [3.0573, 50.6292]),
        g("Strasbourg", "Grand Est, France", "city", [7.7521, 48.5734]),
        g("Toulouse", "Occitanie, France", "city", [1.4442, 43.6047]),
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn sample_is_not_empty() {
        assert!(!super::places().is_empty());
        assert!(super::gazetteer().len() >= 10);
    }
}
