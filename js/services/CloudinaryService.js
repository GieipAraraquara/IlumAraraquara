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
     * Transforms a Cloudinary image URL to include dynamic delivery optimizations
     * Adds f_auto (auto format: WebP/AVIF), q_auto (auto quality compression), and optional max width
     * @param {string} url - Original Cloudinary image URL
     * @param {Object} [options] - Options { width: number, quality: string, format: string }
     * @returns {string} Transformed Cloudinary URL
     */
    otimizarUrl(url, options = {}) {
        if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
            return url;
        }

        const quality = options.quality || 'auto';
        const format = options.format || 'auto';
        const width = options.width ? `,w_${options.width},c_limit` : '';
        const transformStr = `f_${format},q_${quality}${width}`;

        if (url.includes('/image/upload/f_') || url.includes('/image/upload/q_') || url.includes('/image/upload/w_') || url.includes('/image/upload/c_')) {
            return url;
        }

        return url.replace('/image/upload/', `/image/upload/${transformStr}/`);
    }

    /**
     * Compresses an image (File, Blob, or Base64 string) client-side using HTML5 Canvas.
     * Resizes large photos (e.g., 4000x3000 -> 1200x900 max) and applies JPEG quality compression.
     * Drastically reduces file size (typically by 90-95%) prior to upload.
     * @param {File|Blob|string} imageInput - Source image
     * @param {number} [maxDimension=1200] - Max width or height in pixels
     * @param {number} [quality=0.75] - Compression quality (0.0 to 1.0)
     * @returns {Promise<File|Blob|string>} Compressed image in same input format
     */
    async compressImage(imageInput, maxDimension = 1200, quality = 0.75) {
        if (!imageInput) return null;

        if (typeof imageInput === 'string' && (imageInput.startsWith('http://') || imageInput.startsWith('https://'))) {
            return imageInput;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
                        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                        console.log(`⚡ [CloudinaryService] Compression Base64: ${(imageInput.length / 1024).toFixed(1)}KB -> ${(compressedBase64.length / 1024).toFixed(1)}KB`);
                        resolve(compressedBase64);
                    } else {
                        canvas.toBlob(
                            (blob) => {
                                if (blob) {
                                    console.log(`⚡ [CloudinaryService] Compression Blob: ${(blob.size / 1024).toFixed(1)}KB`);
                                    resolve(blob);
                                } else {
                                    resolve(imageInput);
                                }
                            },
                            'image/jpeg',
                            quality
                        );
                    }
                } catch (e) {
                    console.warn('⚠️ [CloudinaryService] Erro ao comprimir imagem, usando original:', e);
                    resolve(imageInput);
                }
            };

            img.onerror = (err) => {
                console.warn('⚠️ [CloudinaryService] Erro ao carregar imagem para compressão:', err);
                resolve(imageInput);
            };

            if (typeof imageInput === 'string') {
                img.src = imageInput;
            } else if (imageInput instanceof File || imageInput instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => { img.src = e.target.result; };
                reader.onerror = () => { resolve(imageInput); };
                reader.readAsDataURL(imageInput);
            } else {
                resolve(imageInput);
            }
        });
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
     * @param {Object} [options] - Compression options { compress: boolean, maxDimension: number, quality: number }
     * @returns {Promise<string>} Secure Cloudinary CDN URL
     */
    async uploadImage(imageInput, customFolder = null, customPublicId = null, options = {}) {
        if (!imageInput) return null;

        // If input is already an HTTP/HTTPS URL, don't re-upload
        if (typeof imageInput === 'string' && (imageInput.startsWith('http://') || imageInput.startsWith('https://'))) {
            return imageInput;
        }

        // Perform client-side compression before upload unless explicitly disabled
        let fileToUpload = imageInput;
        if (options.compress !== false) {
            try {
                fileToUpload = await this.compressImage(
                    imageInput, 
                    options.maxDimension || 1200, 
                    options.quality || 0.75
                );
            } catch (compErr) {
                console.warn('⚠️ [CloudinaryService] Falha ao comprimir imagem, enviando original:', compErr);
                fileToUpload = imageInput;
            }
        }

        const cloudName = this.config ? this.config.cloudName : 'vwn8memy';
        const uploadPreset = this.config ? this.config.uploadPreset : 'sistema_os_preset';
        const folder = customFolder || (this.config ? this.config.folder : 'sistema_os');

        const formData = new FormData();
        formData.append('file', fileToUpload);
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
     * @param {Object} [options] - Compression options
     * @returns {Promise<Array<string>>} List of Cloudinary CDN URLs
     */
    async uploadMultiple(imageList = [], customFolder = null, onProgress = null, options = {}) {
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

            const url = await this.uploadImage(img, customFolder, null, options);
            results.push(url);
        }

        return results;
    }
}

// Global Singleton Instance
window.CloudinaryService = CloudinaryService;
window.cloudinaryService = new CloudinaryService();
