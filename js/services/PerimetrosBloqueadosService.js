/**
 * Serviço de Gerenciamento e Validação de Perímetros Bloqueados (Condomínios, Áreas Privadas)
 * Compatível com Mapbox GL, Supabase e LocalStorage como fallback.
 */
class PerimetrosBloqueadosService {
    constructor() {
        this.tableName = 'perimetros_bloqueados';
        this.cache = null;
        this.storageKey = 'sistema_os_perimetros_bloqueados_cache';
    }

    getClient() {
        return window.supabaseClient || (window.supabase ? window.supabase : null);
    }

    /**
     * Algoritmo Ray-Casting Point-in-Polygon (coordenadas no formato [lng, lat])
     * @param {Array<number>} point [lng, lat]
     * @param {Array<Array<number>>} vs Array de vértices [[lng, lat], ...]
     * @returns {boolean}
     */
    pontoEstaNoPoligono(point, vs) {
        if (!point || !vs || vs.length < 3) return false;
        const x = point[0]; // lng
        const y = point[1]; // lat

        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Carrega lista de perímetros ativos do Supabase (com cache local)
     * @param {boolean} forceReload 
     */
    async listarPerimetros(forceReload = false) {
        if (!forceReload && this.cache) {
            return this.cache;
        }

        const client = this.getClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(this.tableName)
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!error && data) {
                    this.cache = data;
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(data));
                    } catch (e) {}
                    return data;
                }
            } catch (err) {
                console.warn('[PerimetrosBloqueadosService] Erro ao buscar no Supabase, usando cache local:', err);
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

    /**
     * Salva ou atualiza um perímetro
     * @param {Object} perimetro 
     */
    async salvarPerimetro(perimetro) {
        const client = this.getClient();
        const payload = {
            nome: perimetro.nome,
            justificativa: perimetro.justificativa || 'Área particular / Condomínio fechado não atendido pela concessão pública municipal.',
            tipo: perimetro.tipo || 'condominio',
            coordenadas: perimetro.coordenadas, // Array de [lng, lat]
            ativo: perimetro.ativo !== undefined ? perimetro.ativo : true,
            updated_at: new Date().toISOString()
        };

        if (perimetro.id) {
            payload.id = perimetro.id;
        }

        if (client) {
            try {
                let res;
                if (payload.id) {
                    res = await client.from(this.tableName).update(payload).eq('id', payload.id).select().single();
                } else {
                    res = await client.from(this.tableName).insert(payload).select().single();
                }

                if (res.error) throw res.error;
                await this.listarPerimetros(true);
                return res.data;
            } catch (err) {
                console.error('[PerimetrosBloqueadosService] Erro ao persistir no Supabase:', err);
                throw err;
            }
        } else {
            // Modo local sem Supabase
            const lista = await this.listarPerimetros();
            if (payload.id) {
                const idx = lista.findIndex(p => p.id === payload.id);
                if (idx !== -1) lista[idx] = { ...lista[idx], ...payload };
            } else {
                payload.id = Date.now();
                lista.unshift(payload);
            }
            this.cache = lista;
            localStorage.setItem(this.storageKey, JSON.stringify(lista));
            return payload;
        }
    }

    /**
     * Exclui um perímetro
     * @param {number|string} id 
     */
    async excluirPerimetro(id) {
        const idNum = Number(id);
        const client = this.getClient();
        if (client) {
            try {
                const { error } = await client.from(this.tableName).delete().eq('id', idNum);
                if (error) throw error;
                await this.listarPerimetros(true);
                return true;
            } catch (err) {
                console.error('[PerimetrosBloqueadosService] Erro ao excluir no Supabase:', err);
                throw err;
            }
        }

        const lista = await this.listarPerimetros();
        this.cache = lista.filter(p => Number(p.id) !== idNum);
        localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
        return true;
    }

    /**
     * Alterna o estado ativo/inativo
     */
    async alternarAtivo(id, ativo) {
        const client = this.getClient();
        if (client) {
            const { error } = await client.from(this.tableName).update({ ativo: ativo, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
        }
        const lista = await this.listarPerimetros();
        const item = lista.find(p => p.id === id);
        if (item) item.ativo = ativo;
        this.cache = lista;
        localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
        return item;
    }

    /**
     * Verifica se um ponto geográfico (lat, lng) está contido em algum perímetro proibido ativo.
     * Retorna o perímetro bloqueador ou null se for permitido.
     * @param {number} lat Latitude
     * @param {number} lng Longitude
     * @returns {Promise<Object|null>} Perímetro que causou o bloqueio ou null
     */
    async verificarPontoBloqueado(lat, lng) {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

        const perimetros = await this.listarPerimetros();
        const pt = [parseFloat(lng), parseFloat(lat)];

        for (const peri of perimetros) {
            if (peri.ativo === false) continue;

            let vertices = [];
            if (Array.isArray(peri.coordenadas)) {
                // Pode ser [[lng, lat], ...] ou GeoJSON Polygon coordinates [[[lng, lat], ...]]
                if (Array.isArray(peri.coordenadas[0]) && Array.isArray(peri.coordenadas[0][0])) {
                    vertices = peri.coordenadas[0];
                } else if (Array.isArray(peri.coordenadas[0])) {
                    vertices = peri.coordenadas;
                }
            } else if (peri.coordenadas && peri.coordenadas.coordinates) {
                vertices = peri.coordenadas.coordinates[0];
            }

            if (vertices && vertices.length >= 3) {
                if (this.pontoEstaNoPoligono(pt, vertices)) {
                    return peri;
                }
            }
        }

        return null;
    }
}

// Inicializa instância singleton
window.PerimetrosBloqueadosService = new PerimetrosBloqueadosService();
