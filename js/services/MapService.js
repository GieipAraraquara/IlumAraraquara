/**
 * Service Layer - Map Service
 * Manages shared Mapbox modal instance and address point visualization.
 * Uses a single persistent Mapbox map instance to avoid re-initialization and conserve API quota.
 */

const MAPBOX_TOKEN_SHARED = 'pk.eyJ1IjoiaW9jb3N0YSIsImEiOiJjbXJ5dnE0cGgwZXM4MnpwbWEzOHY0NGMxIn0.2zn9iSNiZe4Vd8yuwYYp-A';

// Suppress Mapbox telemetry requests to events.mapbox.com to eliminate CORS errors in browser
(function suppressMapboxTelemetry() {
    if (window._mapboxTelemetrySuppressed) return;
    window._mapboxTelemetrySuppressed = true;

    // 1. Intercept window.fetch
    const originalFetch = window.fetch;
    if (originalFetch) {
        window.fetch = function(input, init) {
            let url = '';
            if (typeof input === 'string') {
                url = input;
            } else if (input && typeof input === 'object') {
                url = input.url || input.href || String(input);
            }
            if (url && url.includes('events.mapbox.com')) {
                return Promise.resolve(new Response(JSON.stringify({}), { status: 200, statusText: 'OK' }));
            }
            return originalFetch.call(window, input, init);
        };
    }

    // 2. Intercept XMLHttpRequest
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._mapboxUrl = typeof url === 'string' ? url : '';
        return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(data) {
        if (this._mapboxUrl && this._mapboxUrl.includes('events.mapbox.com')) {
            try {
                Object.defineProperty(this, 'status', { value: 200, writable: true });
                Object.defineProperty(this, 'readyState', { value: 4, writable: true });
            } catch(e) {}
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            if (typeof this.onload === 'function') this.onload();
            return;
        }
        return origSend.apply(this, arguments);
    };

    // 3. Intercept navigator.sendBeacon
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const originalBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function(url, data) {
            if (typeof url === 'string' && url.includes('events.mapbox.com')) {
                return true;
            }
            return originalBeacon(url, data);
        };
    }

    // 4. Set Mapbox GL JS configuration flags if mapboxgl exists
    if (typeof window !== 'undefined' && window.mapboxgl) {
        mapboxgl.accessToken = MAPBOX_TOKEN_SHARED;
        if (mapboxgl.config) {
            mapboxgl.config.SEND_EVENTS = false;
            mapboxgl.config.EVENTS_URL = '';
        }
    }
})();

// Global persistent references
window.sharedMapInstance = window.sharedMapInstance || null;
window.sharedMapMarker = window.sharedMapMarker || null;

window.abrirMapaPonto = async function(osId, pointIndex = 0, event) {
    if (event) event.stopPropagation();

    // 1. Search for item in PainelController or AuditoriaController chamadosList
    let item = null;
    if (window.painelController && Array.isArray(window.painelController.chamadosList)) {
        item = window.painelController.chamadosList.find(c => String(c.id) === String(osId) || String(c.protocolo) === String(osId));
    }
    if (!item && window.auditoriaController) {
        if (Array.isArray(window.auditoriaController.concludedList)) {
            item = window.auditoriaController.concludedList.find(c => String(c.id) === String(osId) || String(c.protocolo) === String(osId));
        }
        if (!item && Array.isArray(window.auditoriaController.chamadosList)) {
            item = window.auditoriaController.chamadosList.find(c => String(c.id) === String(osId) || String(c.protocolo) === String(osId));
        }
    }

    // Fallback search in static DOM table rows if controller list is empty
    if (!item) {
        const row = document.querySelector(`tr[data-id="${osId}"]`) || Array.from(document.querySelectorAll('tr')).find(r => r.cells[0]?.textContent.trim() === String(osId));
        if (row) {
            const protoText = row.cells[0]?.textContent.trim();
            const addrCell = row.cells[2];
            const coordCell = row.cells[3];
            const addrText = addrCell ? addrCell.textContent.trim() : 'Endereço não informado';
            const coordText = coordCell ? coordCell.textContent.trim().replace(/\s+/g, ' ') : '';
            item = {
                id: osId,
                protocolo: protoText || osId,
                endereco: addrText,
                coordenadaReparo: coordText,
                addressPoints: [addrText],
                statusBadgeLabel: 'Concluída',
                normalizedStatus: 'concluida',
                problemaInicial: 'Auditado'
            };
        }
    }

    if (!item) {
        console.warn('⚠️ Ordem de Serviço não encontrada:', osId);
        return;
    }

    const modal = document.getElementById('modal-mapa-ponto');
    const modalBox = document.getElementById('modal-mapa-ponto-box');
    if (!modal || !modalBox) return;

    // 2. Update Modal Header & Card Data
    const protoEl = document.getElementById('modal-mapa-protocolo');
    if (protoEl) protoEl.textContent = `Protocolo #${item.protocolo}`;
    
    const statusBadge = document.getElementById('modal-mapa-status-badge');
    if (statusBadge) {
        statusBadge.textContent = item.statusBadgeLabel || item.status || 'Concluída';
        let badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error-container text-on-error-container';
        if (item.normalizedStatus === 'concluida') badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#166534]';
        if (item.normalizedStatus === 'cancelada') badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700';
        if (item.normalizedStatus === 'pendente') badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface';
        statusBadge.className = badgeClass;
    }

    const points = item.addressPoints || [item.endereco || 'Endereço não informado'];
    const currentPointText = points[pointIndex] || points[0] || 'Localização não informada';
    
    const hasAddress = window.ChamadoModel ? window.ChamadoModel.isValidLocationText(item.endereco) : Boolean(item.endereco);
    const rawPlaqueta = window.ChamadoModel ? window.ChamadoModel.formatLocationText(item.plaquetaFinal || item.plaquetaInicial) : (item.plaquetaFinal || item.plaquetaInicial || '');
    const validPlaqueta = (rawPlaqueta && rawPlaqueta !== '[---]' && rawPlaqueta !== '---') ? rawPlaqueta.replace(/^Plaqueta:\s*/i, '').trim() : '';
    const hasPlaqueta = Boolean(validPlaqueta);

    const cleanPointText = window.ChamadoModel ? window.ChamadoModel.formatLocationText(currentPointText).replace(/^Plaqueta:\s*/i, '').trim() : currentPointText;

    const subEnd = document.getElementById('modal-mapa-endereco-sub');
    if (subEnd) {
        subEnd.textContent = hasAddress ? item.endereco : (hasPlaqueta ? `Plaqueta ${validPlaqueta}` : cleanPointText);
    }

    const cardPonto = document.getElementById('modal-mapa-card-ponto');
    if (cardPonto) {
        if (hasAddress) {
            cardPonto.textContent = item.endereco;
        } else if (hasPlaqueta) {
            cardPonto.textContent = `Plaqueta ${validPlaqueta}`;
        } else {
            cardPonto.textContent = cleanPointText;
        }
    }

    // Exibir a linha dedicada de Plaqueta APENAS quando existir endereço de rua E plaqueta simultaneamente
    const plaquetaRow = document.getElementById('modal-mapa-card-plaqueta-row');
    if (hasAddress && hasPlaqueta && plaquetaRow) {
        plaquetaRow.classList.remove('hidden');
        const cardPlq = document.getElementById('modal-mapa-card-plaqueta');
        if (cardPlq) cardPlq.textContent = validPlaqueta;
    } else if (plaquetaRow) {
        plaquetaRow.classList.add('hidden');
    }

    const cardProb = document.getElementById('modal-mapa-card-problema');
    if (cardProb) cardProb.textContent = item.problemaInicial || item.problemaEncontrado || 'Não informado';

    // 3. Display Modal with Animation
    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBox.classList.remove('scale-95', 'opacity-0');
        modalBox.classList.add('scale-100', 'opacity-100');
    }, 10);

    // 4. Coordinates Resolution
    let lat = null;
    let lng = null;

    const rawCoordStr = window.ChamadoModel ? window.ChamadoModel.formatLocationText(item.coordenadaReparo || item.coordenadaInicial) : (item.coordenadaReparo || item.coordenadaInicial || '');
    const hasRawCoord = rawCoordStr && (window.ChamadoModel ? window.ChamadoModel.isValidLocationText(rawCoordStr) : Boolean(rawCoordStr));
    const hasExplicitCoordinates = hasRawCoord && !hasAddress && !hasPlaqueta;

    if (hasRawCoord) {
        const parts = rawCoordStr.split(',');
        if (parts.length >= 2) {
            let p1 = parseFloat(parts[0].trim());
            let p2 = parseFloat(parts[1].trim());
            if (!isNaN(p1) && !isNaN(p2)) {
                if (Math.abs(p1) > 35 && Math.abs(p2) < 35) {
                    lng = p1;
                    lat = p2;
                } else {
                    lat = p1;
                    lng = p2;
                }
            }
        }
    }

    // Geocoding fallback via Mapbox API if no raw coordinates
    if ((lat === null || lng === null) && currentPointText && currentPointText !== 'Endereço não informado' && currentPointText !== 'Ponto não informado') {
        try {
            const query = encodeURIComponent(`${currentPointText}, Araraquara, SP, Brasil`);
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN_SHARED}&limit=1`);
            const geoData = await res.json();
            if (geoData && geoData.features && geoData.features.length > 0) {
                const center = geoData.features[0].center; // [lng, lat]
                lng = center[0];
                lat = center[1];
            }
        } catch (e) {
            console.warn('⚠️ Falha ao consultar Geocoding do Mapbox:', e);
        }
    }

    // Fallback determinístico em Araraquara, SP
    if (lat === null || lng === null) {
        const hashStr = String(item.id || item.protocolo || osId || 'OS');
        let hash = 0;
        for (let i = 0; i < hashStr.length; i++) {
            hash = (hash << 5) - hash + hashStr.charCodeAt(i);
            hash |= 0;
        }
        const offsetLat = ((Math.abs(hash) % 100) - 50) * 0.0006;
        const offsetLng = ((Math.abs(hash * 13) % 100) - 50) * 0.0006;
        lat = -21.7946 + offsetLat;
        lng = -48.1766 + offsetLng;
    }

    // Update Card Coords & Type Badge
    const coordsRow = document.getElementById('modal-mapa-card-coords-row');
    const cardTipoBadge = document.getElementById('modal-mapa-card-tipo');

    if (hasRawCoord && lat !== null && lng !== null && coordsRow) {
        coordsRow.classList.remove('hidden');
        const cardCoords = document.getElementById('modal-mapa-card-coords');
        if (cardCoords) cardCoords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } else if (coordsRow) {
        coordsRow.classList.add('hidden');
    }

    if (cardTipoBadge) {
        if (hasExplicitCoordinates) cardTipoBadge.textContent = 'Coordenada GPS';
        else if (hasAddress) cardTipoBadge.textContent = 'Endereço';
        else if (hasPlaqueta) cardTipoBadge.textContent = 'Plaqueta';
        else cardTipoBadge.textContent = 'Localização';
    }

    // 5. Initialize or Reuse Singleton Mapbox Instance
    setTimeout(() => {
        if (window.mapboxgl) {
            mapboxgl.accessToken = MAPBOX_TOKEN_SHARED;
            if (mapboxgl.config) mapboxgl.config.SEND_EVENTS = false;
            try {
                if (mapboxgl.telemetry && typeof mapboxgl.telemetry.stop === 'function') {
                    mapboxgl.telemetry.stop();
                }
                if ('telemetry' in mapboxgl) {
                    mapboxgl.telemetry = false;
                }
            } catch (e) {}
            
            if (!window.sharedMapInstance) {
                window.sharedMapInstance = new mapboxgl.Map({
                    container: 'mapa-ponto-canvas',
                    style: 'mapbox://styles/mapbox/streets-v12',
                    center: [lng, lat],
                    zoom: 16
                });
                window.sharedMapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
                window.sharedMapInstance.addControl(new mapboxgl.FullscreenControl(), 'top-right');
            } else {
                window.sharedMapInstance.resize();
                window.sharedMapInstance.flyTo({
                    center: [lng, lat],
                    zoom: 16,
                    essential: true
                });
            }

            if (window.sharedMapMarker) {
                window.sharedMapMarker.remove();
            }

            const elMarker = document.createElement('div');
            elMarker.className = 'custom-map-pin flex items-center justify-center cursor-pointer';
            elMarker.innerHTML = `
                <div class="relative flex items-center justify-center">
                    <span class="absolute w-8 h-8 rounded-full bg-secondary/30 animate-ping"></span>
                    <div class="w-10 h-10 rounded-full bg-secondary text-white flex items-center justify-center shadow-2xl border-2 border-white z-10 hover:scale-110 transition-transform">
                        <span class="material-symbols-outlined text-[22px]">location_on</span>
                    </div>
                </div>
            `;

            window.sharedMapMarker = new mapboxgl.Marker({ element: elMarker })
                .setLngLat([lng, lat])
                .addTo(window.sharedMapInstance);

            window.sharedMapInstance.resize();
        }
    }, 150);
};

window.closeMapaPontoModal = function() {
    const modal = document.getElementById('modal-mapa-ponto');
    const modalBox = document.getElementById('modal-mapa-ponto-box');
    if (!modal || !modalBox) return;

    modalBox.classList.remove('scale-100', 'opacity-100');
    modalBox.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
};

// Global keydown escape event listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeMapaPontoModal();
    }
});
