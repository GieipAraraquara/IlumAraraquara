/**
 * Service Layer - Cloudinary Service
 * Manages image uploading to Cloudinary using secure Unsigned Upload Presets.
 * Completely safe for browser execution (zero secret keys required on client).
 */

class CloudinaryService {
    constructor(config) {
        this.config = config || window.CloudinaryConfig;
    }

    /**
     * Generates a standardized OS photo filename matching the system pattern
     * Pattern: [PROTOCOLO] [PLAQUETA] [ESTAGIO] [MES] [ANO] DD-MM-YYYY_HH-mm-ss
     * @param {string} protocolo - OS Protocol
     * @param {string} plaqueta - Plaqueta ID
     * @param {string} estagio - Stage name (e.g. PROBLEMA ENCONTRADO, REPARO EFETUADO, PLAQUETA, FOTO ENTRADA)
     * @returns {string} Standardized public_id string
     */
    gerarNomePadraoFoto(protocolo, plaqueta, estagio) {
        const dataAtual = new Date();
        const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
        const mesEscrito = meses[dataAtual.getMonth()];
        const ano4Digitos = dataAtual.getFullYear();

        const dia = ("0" + dataAtual.getDate()).slice(-2);
        const mes = ("0" + (dataAtual.getMonth() + 1)).slice(-2);
        const ano = dataAtual.getFullYear();
        const hora = ("0" + dataAtual.getHours()).slice(-2);
        const min = ("0" + dataAtual.getMinutes()).slice(-2);
        const sec = ("0" + dataAtual.getSeconds()).slice(-2);
        const dataHoraFormatada = `${dia}-${mes}-${ano}_${hora}-${min}-${sec}`;

        const prot = (protocolo || "SEM_PROTOCOLO").toUpperCase().trim();
        const plaq = (plaqueta || "S_P").toUpperCase().trim();
        const est = (estagio || "EVIDENCIA").toUpperCase().trim();

        return `[${prot}] [${plaq}] [${est}] [${mesEscrito}] [${ano4Digitos}] ${dataHoraFormatada}`;
    }

    /**
     * Uploads a single image (Base64 data URL, Blob, or File) to Cloudinary via Unsigned Upload
     * @param {File|Blob|string} imageInput - Image file or Base64 string
     * @param {string} [customFolder] - Optional subfolder in Cloudinary
     * @param {string} [customPublicId] - Optional custom public_id / filename
     * @returns {Promise<string>} Secure Cloudinary CDN URL
     */
    async uploadImage(imageInput, customFolder = null, customPublicId = null) {
        if (!imageInput) return null;

        // If input is already an HTTP/HTTPS URL, don't re-upload
        if (typeof imageInput === 'string' && (imageInput.startsWith('http://') || imageInput.startsWith('https://'))) {
            return imageInput;
        }

        const cloudName = this.config ? this.config.cloudName : 'vwn8memy';
        const uploadPreset = this.config ? this.config.uploadPreset : 'sistema_os_preset';
        const folder = customFolder || (this.config ? this.config.folder : 'sistema_os');

        const formData = new FormData();
        formData.append('file', imageInput);
        formData.append('upload_preset', uploadPreset);
        if (folder) {
            formData.append('folder', folder);
        }
        if (customPublicId) {
            formData.append('public_id', customPublicId);
        }

        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

        try {
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                const errMsg = data.error ? data.error.message : 'Falha no upload para Cloudinary';
                throw new Error(`Cloudinary Error (${response.status}): ${errMsg}`);
            }

            console.log('⚡ [CloudinaryService] Imagem enviada com sucesso:', data.secure_url);
            return data.secure_url;
        } catch (err) {
            console.error('❌ [CloudinaryService] Erro ao enviar imagem:', err);
            throw err;
        }
    }

    /**
     * Uploads multiple images sequentially or in parallel
     * @param {Array<File|Blob|string>} imageList - List of images
     * @param {string} [customFolder] - Subfolder name
     * @param {Function} [onProgress] - Optional callback (current, total)
     * @returns {Promise<Array<string>>} List of Cloudinary CDN URLs
     */
    async uploadMultiple(imageList = [], customFolder = null, onProgress = null) {
        const results = [];
        const total = imageList.length;

        for (let i = 0; i < total; i++) {
            const img = imageList[i];
            if (!img) {
                results.push(null);
                continue;
            }

            if (typeof onProgress === 'function') {
                onProgress(i + 1, total);
            }

            const url = await this.uploadImage(img, customFolder);
            results.push(url);
        }

        return results;
    }
}

// Global Singleton Instance
window.CloudinaryService = CloudinaryService;
window.cloudinaryService = new CloudinaryService();
