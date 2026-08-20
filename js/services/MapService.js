/**
 * Service Layer - Map Service
 * Manages shared Mapbox modal instance and address point visualization.
 * Uses a single persistent Mapbox map instance to avoid re-initialization and conserve API quota.
 */

const MAPBOX_TOKEN_SHARED = 'pk.eyJ1IjoiaW9jb3N0YSIsImEiOiJjbXJ5dnE0cGgwZXM4MnpwbWEzOHY0NGMxIn0.2zn9iSNiZe4Vd8yuwYYp-A';

// Função Global de Navegação Externa (Waze / Google Maps)
window.abrirNavegacaoExterna = function(tipo, event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }
    const navLinks = window.currentMapaNavLinks || {};
    const url = navLinks[tipo];
    if (url && url !== '#') {
        window.open(url, '_blank');
    } else {
        const btnId = tipo === 'gmaps' ? 'modal-mapa-btn-gmaps' : 'modal-mapa-btn-waze';
        const btn = document.getElementById(btnId);
        if (btn && btn.href && btn.href !== '#' && !btn.href.endsWith('#')) {
            window.open(btn.href, '_blank');
        } else {
            alert('Navegação indisponível para esta localização.');
        }
    }
};

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
window.currentMapaNavLinks = window.currentMapaNavLinks || { gmaps: '#', waze: '#' };

window.abrirMapaPonto = async function(osId, pointIndex = 0, event) {
    if (typeof pointIndex !== 'number') {
        event = pointIndex;
        pointIndex = 0;
    }
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    // 1. Search for item in PainelController or AuditoriaController chamadosList, or check if osId is an object
    let item = null;
    if (typeof osId === 'object' && osId !== null) {
        item = osId;
    }
    if (!item && window.painelController && Array.isArray(window.painelController.chamadosList)) {
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
        const stText = item.statusBadgeLabel || item.status || 'Em aberto';
        statusBadge.textContent = stText;
        let badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200';
        if (item.normalizedStatus === 'concluida' || stText.toLowerCase().includes('conclu')) {
            badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200';
        } else if (item.normalizedStatus === 'cancelada' || stText.toLowerCase().includes('cancel')) {
            badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700 border border-slate-300';
        } else if (stText.toLowerCase().includes('andamento') || stText.toLowerCase().includes('iniciad')) {
            badgeClass = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200';
        }
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

    // Helper local para extrair coordenadas { lat, lng } do item com suporte ao ChamadoModel
    const resolveItemCoords = (targetItem) => {
        if (!targetItem) return null;
        const cRep = targetItem.coordenadaReparo || targetItem.coordenada_reparo;
        const cIni = targetItem.coordenadaInicial || targetItem.coordenada_inicial || targetItem.coordenada;
        
        let pt = null;
        if (window.ChamadoModel && typeof window.ChamadoModel.parseLatLng === 'function') {
            pt = window.ChamadoModel.parseLatLng(cRep) || window.ChamadoModel.parseLatLng(cIni);
        } else {
            const str = String(cRep || cIni || '').replace(/^"|"$/g, '').trim();
            if (str && str.includes(',')) {
                const parts = str.split(',').map(s => parseFloat(s.trim()));
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    pt = Math.abs(parts[0]) > 35
                        ? { lat: parts[1], lng: parts[0] }
                        : { lat: parts[0], lng: parts[1] };
                }
            }
        }
        return pt;
    };

    const cleanAddressSearchText = (rawText) => {
        if (!rawText) return '';
        return String(rawText)
            .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
            .replace(/^Plaqueta:\s*/i, '')
            .trim();
    };

    // Geracao imediata de links preliminares de navegacao
    let initGmaps = '#';
    let initWaze = '#';
    const initPt = resolveItemCoords(item);
    const cleanSearchText = cleanAddressSearchText(currentPointText);

    if (initPt) {
        initGmaps = `https://www.google.com/maps/search/?api=1&query=${initPt.lat},${initPt.lng}`;
        initWaze = `https://waze.com/ul?ll=${initPt.lat},${initPt.lng}&navigate=yes`;
    } else if (cleanSearchText && cleanSearchText !== 'Endereço não informado' && cleanSearchText !== 'Localização não informada' && cleanSearchText !== 'Ponto não informado') {
        const qEnc = encodeURIComponent(cleanSearchText + ', Araraquara - SP');
        initGmaps = `https://www.google.com/maps/search/?api=1&query=${qEnc}`;
        initWaze = `https://waze.com/ul?q=${qEnc}&navigate=yes`;
    }
    window.currentMapaNavLinks = { gmaps: initGmaps, waze: initWaze };
    const btnGmapsInit = document.getElementById('modal-mapa-btn-gmaps');
    if (btnGmapsInit) btnGmapsInit.href = initGmaps;
    const btnWazeInit = document.getElementById('modal-mapa-btn-waze');
    if (btnWazeInit) btnWazeInit.href = initWaze;

    // 3. Display Modal with Animation
    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBox.classList.remove('scale-95', 'opacity-0');
        modalBox.classList.add('scale-100', 'opacity-100');
    }, 10);

    // 4. Coordinates Resolution
    let lat = null;
    let lng = null;

    const parsedPt = resolveItemCoords(item);
    const hasRawCoord = Boolean(parsedPt);
    const hasExplicitCoordinates = hasRawCoord && !hasAddress && !hasPlaqueta;

    if (parsedPt) {
        lat = parsedPt.lat;
        lng = parsedPt.lng;
    }

    // Geocoding fallback via Mapbox API if no raw coordinates
    if ((lat === null || lng === null) && cleanSearchText && cleanSearchText !== 'Endereço não informado' && cleanSearchText !== 'Ponto não informado') {
        try {
            const query = encodeURIComponent(`${cleanSearchText}, Araraquara, SP, Brasil`);
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

    console.log("🗺️ [MapService] abrirMapaPonto chamado com item:", item, "pointIndex:", pointIndex);

    // Update Waze & Google Maps Navigation Links (Immediate & Resolved)
    let linkGmaps = '#';
    let linkWaze = '#';
    if (lat !== null && lng !== null) {
        linkGmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        linkWaze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    } else if (cleanSearchText && cleanSearchText !== 'Endereço não informado' && cleanSearchText !== 'Localização não informada' && cleanSearchText !== 'Ponto não informado') {
        const queryEnc = encodeURIComponent(cleanSearchText + ', Araraquara - SP');
        linkGmaps = `https://www.google.com/maps/search/?api=1&query=${queryEnc}`;
        linkWaze = `https://waze.com/ul?q=${queryEnc}&navigate=yes`;
    }

    window.currentMapaNavLinks = {
        gmaps: linkGmaps,
        waze: linkWaze
    };

    console.log("🗺️ [MapService] Links gerados:", window.currentMapaNavLinks);

    const btnGmaps = document.getElementById('modal-mapa-btn-gmaps');
    if (btnGmaps) {
        btnGmaps.href = linkGmaps;
        console.log("🗺️ [MapService] btnGmaps.href atribuído para:", btnGmaps.href);
    } else {
        console.warn("⚠️ [MapService] Elemento #modal-mapa-btn-gmaps não foi encontrado no DOM.");
    }

    const btnWaze = document.getElementById('modal-mapa-btn-waze');
    if (btnWaze) {
        btnWaze.href = linkWaze;
        console.log("🗺️ [MapService] btnWaze.href atribuído para:", btnWaze.href);
    } else {
        console.warn("⚠️ [MapService] Elemento #modal-mapa-btn-waze não foi encontrado no DOM.");
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeMapaPontoModal();
    }
});
