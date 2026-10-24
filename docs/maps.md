# Geographic reference map

QALQAN's Geography page is a real, interactive OpenStreetMap basemap rendered with Leaflet 1.9.4. A white and emerald city directory sits beside a rounded map card, starting with Astana. City buttons select Atyrau, Astana and Almaty; View all Kazakhstan fits the country. It supports dragging, touch zoom, keyboard panning and zoom controls. Scroll-wheel zoom is disabled so the map does not capture page scrolling. Google Maps, Google satellite and OpenStreetMap links follow the current viewport; they open an external provider in a new tab.

This map provides geographic context only. QALQAN adds no account, customer, transaction or bank-branch overlays. Places or business labels contained in the provider's basemap belong to OpenStreetMap, not a QALQAN branch dataset. The illustrative transfer graph remains separate. A viewport center does not represent an asset location, and the map is not evidence of a transaction's origin or destination.

## Reference viewports and sources

| View                 | Center / zoom       | Basis                                                                                                                                                                                |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Atyrau city vicinity | 47.106, 51.921 / 10 | Rounded from a public promenade's 47.10606, 51.92095 coordinates on [Kazakhstan Travel](https://kazakhstan.travel/en/attractions/133). The view is explicitly labeled city vicinity. |
| Astana city vicinity | 51.180, 71.446 / 10 | [GeoNames city reference](https://www.geonames.org/kz/largest-cities-in-kazakhstan.html).                                                                                            |
| Almaty city vicinity | 43.252, 76.911 / 10 | [GeoNames city reference](https://www.geonames.org/kz/largest-cities-in-kazakhstan.html).                                                                                            |

Fit Kazakhstan uses approximate view bounds `[40.6, 46.5]` to `[55.4, 87.4]` with padding. These values frame the country; the app does not draw a boundary from them. Sources checked 23 October 2026.

## Providers and operation

The embedded layer requests `https://tile.openstreetmap.org/{z}/{x}/{y}.png` as normal browser images. Attribution links to © OpenStreetMap contributors stay visible on the map and beneath it. Browser cache headers and referrer behavior are left at their defaults. There is no bulk download, offline pack, geolocation request or tile proxy. The layer's one-tile buffer is Leaflet's immediate viewport buffer, not a region-prefetch feature. See the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).

Map tiles and external providers require internet access. The tile service has no availability guarantee. Failed tiles or an offline browser produce a visible notice, a retry action and external-provider alternatives; initialization failure leaves the provider links available. No API key is required for the external [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). The documented display-map action supplies the current center and zoom; the satellite link adds `basemap=satellite`. This app does not embed or cache Google imagery.

Before production use, review expected traffic with the chosen tile provider, publish an operational contact and preserve attribution and referrer headers. The [Leaflet reference](https://leafletjs.com/reference.html) documents the map, controls, events and cleanup methods used here. Browser rendering and fallback checks belong in the project's verification record; a successful build alone does not prove external tile availability.
