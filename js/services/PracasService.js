/**
 * Serviço de Gerenciamento do Catálogo de Praças Públicas (localizacao_pracas)
 * Compatível com Supabase, Mapbox GL e sincronização imediata com Abrir.html.
 */
class PracasService {
    constructor() {
        this.tableName = 'localizacao_pracas';
        this.cache = null;
        this.storageKey = 'sistema_os_pracas_admin_cache';
        this.coresDisponiveis = [
            { nome: 'Verde', hex: '#137333', label: 'Verde (Padrão)' },
            { nome: 'Amarelo', hex: '#fbbc04', label: 'Amarelo' },
            { nome: 'Vermelho', hex: '#d93025', label: 'Vermelho' },
            { nome: 'Azul', hex: '#1a73e8', label: 'Azul' },
            { nome: 'Azul Claro', hex: '#00bac6', label: 'Azul Claro' },
            { nome: 'Roxo', hex: '#9333ea', label: 'Roxo' },
            { nome: 'Rosa', hex: '#e91e63', label: 'Rosa' },
            { nome: 'Branco', hex: '#ffffff', label: 'Branco' }
        ];
    }

    getClient() {
        return window.supabaseClient || (window.supabase ? window.supabase : null);
    }

    obterCorHex(cor) {
        if (!cor) return '#137333';
        const cLower = String(cor).trim().toLowerCase();
        if (cLower.includes('amarelo')) return '#fbbc04';
        if (cLower.includes('rosa')) return '#e91e63';
        if (cLower.includes('azul claro')) return '#00bac6';
        if (cLower.includes('azul')) return '#1a73e8';
        if (cLower.includes('branco')) return '#ffffff';
        if (cLower.includes('verde')) return '#137333';
        if (cLower.includes('vermelho')) return '#d93025';
        if (cLower.includes('roxo')) return '#9333ea';
        return '#137333';
    }

    obterNomeCorPorHex(hex) {
        if (!hex) return 'Verde';
        const h = hex.toLowerCase();
        const encontrada = this.coresDisponiveis.find(c => c.hex.toLowerCase() === h);
        return encontrada ? encontrada.nome : 'Verde';
    }

    invalidarCaches() {
        this.cache = null;
        try {
            sessionStorage.removeItem('luz_pracas_cache_v1');
            sessionStorage.removeItem('luz_pracas_cache_version');
            localStorage.removeItem('luz_pracas_cache_v1');
            localStorage.removeItem(this.storageKey);
            localStorage.setItem('luz_pracas_version', Date.now().toString());
        } catch (e) {
            console.warn('[PracasService] Erro ao limpar caches:', e);
        }
    }

    async listarPracas(forceReload = false) {
        if (!forceReload && this.cache && this.cache.length > 0) {
            return this.cache;
        }

        const client = this.getClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(this.tableName)
                    .select('*');

                if (error) throw error;

                if (Array.isArray(data)) {
                    const normalizadas = data.map((row, idx) => {
                        const nome = row['Nome/Endereço'] || row.nome_endereco || row.nome || row.praca || '';
                        const lat = parseFloat(row['Latitude'] || row.latitude || row.lat || 0);
                        const lng = parseFloat(row['Longitude'] || row.longitude || row.lng || 0);
                        const endereco = row['Endereço'] || row.endereco || '';
                        const cor = row['Cor do Marcador'] || row.cor_do_marcador || row.cor || 'Verde';
                        const considerar = row['Considerar?'] || row.considerar || 'Sim';
                        const ativo = String(considerar).trim().toLowerCase() !== 'não';

                        return {
                            id: row.id !== undefined && row.id !== null ? Number(row.id) : (idx + 1),
                            nome: String(nome).trim(),
                            lat: isNaN(lat) ? 0 : lat,
                            lng: isNaN(lng) ? 0 : lng,
                            endereco: String(endereco).trim(),
                            cor: String(cor).trim(),
                            corHex: this.obterCorHex(cor),
                            considerar: String(considerar).trim(),
                            ativo: ativo
                        };
                    });

                    // Ordena por nome alfabético
                    normalizadas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

                    this.cache = normalizadas;
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(normalizadas));
                    } catch (e) {}
                    return normalizadas;
                }
            } catch (err) {
                console.error('[PracasService] Erro ao buscar praças no Supabase:', err);
                throw err;
            }
        }

        // Fallback localStorage
        try {
            const salvo = localStorage.getItem(this.storageKey);
            if (salvo) {
                this.cache = JSON.parse(salvo);
                return this.cache;
            }
        } catch (e) {}

        this.cache = [];
        return this.cache;
    }

    async salvarPraca(praca) {
        if (!praca || !praca.nome || !praca.nome.trim()) {
            throw new Error('O nome da praça é obrigatório.');
        }

        const lat = parseFloat(praca.lat);
        const lng = parseFloat(praca.lng);

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
            throw new Error('Coordenadas geográficas válidas (Latitude e Longitude) são obrigatórias.');
        }

        const client = this.getClient();
        if (!client) {
            throw new Error('Supabase Client indisponível. Verifique sua conexão.');
        }

        const payload = {
            'Nome/Endereço': praca.nome.trim(),
            'Latitude': lat,
            'Longitude': lng,
            'Endereço': (praca.endereco || '').trim(),
            'Cor do Marcador': praca.cor || 'Verde',
            'Considerar?': praca.considerar || (praca.ativo === false ? 'Não' : 'Sim')
        };

        try {
            let res;
            if (praca.id) {
                const idNum = Number(praca.id);
                res = await client
                    .from(this.tableName)
                    .update(payload)
                    .eq('id', idNum)
                    .select()
                    .single();
            } else {
                res = await client
                    .from(this.tableName)
                    .insert(payload)
                    .select()
                    .single();
            }

            if (res.error) throw res.error;

            this.invalidarCaches();
            await this.listarPracas(true);
            return res.data;
        } catch (err) {
            console.error('[PracasService] Erro ao salvar praça:', err);
            throw err;
        }
    }

    async alternarStatusPraca(id, novoStatusAtivo) {
        const idNum = Number(id);
        const client = this.getClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const novoValor = novoStatusAtivo ? 'Sim' : 'Não';
        const { data, error } = await client
            .from(this.tableName)
            .update({ 'Considerar?': novoValor })
            .eq('id', idNum)
            .select()
            .single();

        if (error) throw error;

        this.invalidarCaches();
        await this.listarPracas(true);
        return data;
    }

    async excluirPraca(id) {
        const idNum = Number(id);
        const client = this.getClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from(this.tableName)
            .delete()
            .eq('id', idNum);

        if (error) throw error;

        this.invalidarCaches();
        await this.listarPracas(true);
        return true;
    }

    async reverseGeocode(lng, lat, token) {
        try {
            const t = token || window.MAPBOX_TOKEN_CONFIG || 'pk.eyJ1IjoiaW9jb3N0YSIsImEiOiJjbXJ5dnE0cGgwZXM4MnpwbWEzOHY0NGMxIn0.2zn9iSNiZe4Vd8yuwYYp-A';
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${t}&country=br&language=pt`;
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data && data.features && data.features.length > 0) {
                return data.features[0].place_name || data.features[0].text;
            }
        } catch (e) {
            console.warn('[PracasService] Erro no reverse geocoding:', e);
        }
        return null;
    }

    async forwardGeocode(query, token) {
        try {
            const t = token || window.MAPBOX_TOKEN_CONFIG || 'pk.eyJ1IjoiaW9jb3N0YSIsImEiOiJjbXJ5dnE0cGgwZXM4MnpwbWEzOHY0NGMxIn0.2zn9iSNiZe4Vd8yuwYYp-A';
            const fullQuery = query.toLowerCase().includes('araraquara') ? query : `${query}, Araraquara - SP`;
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullQuery)}.json?access_token=${t}&country=br&language=pt&proximity=-48.1766,-21.7946`;
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data && data.features && data.features.length > 0) {
                const feat = data.features[0];
                return {
                    lng: feat.center[0],
                    lat: feat.center[1],
                    endereco: feat.place_name
                };
            }
        } catch (e) {
            console.warn('[PracasService] Erro no forward geocoding:', e);
        }
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.PracasService = new PracasService();
}
