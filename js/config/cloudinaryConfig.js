/**
 * Infrastructure Layer - Cloudinary Configuration
 * Public client-side configuration using Unsigned Upload Preset.
 * NO API SECRET or sensitive master keys are exposed to the client browser.
 */

(function() {
    const CloudinaryConfig = {
        cloudName: 'vwn8memy',
        uploadPreset: 'sistema_os_preset',
        folder: 'sistema_os'
    };

    window.CloudinaryConfig = CloudinaryConfig;
})();
