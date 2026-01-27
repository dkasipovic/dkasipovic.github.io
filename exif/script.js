// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const loadNewBtn = document.getElementById('loadNewBtn');
const exifContent = document.getElementById('exifContent');
const exifEmpty = document.getElementById('exifEmpty');
const loading = document.getElementById('loading');
const noExif = document.getElementById('noExif');
const exifData = document.getElementById('exifData');
const fileInfo = document.getElementById('fileInfo');
const fileInfoGrid = document.getElementById('fileInfoGrid');
const mapSection = document.getElementById('mapSection');
const mapCoords = document.getElementById('mapCoords');
const thumbnailSection = document.getElementById('thumbnailSection');
const thumbnailImage = document.getElementById('thumbnailImage');
const thumbnailInfo = document.getElementById('thumbnailInfo');
const exifSections = document.getElementById('exifSections');

let map = null;
let marker = null;

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
loadNewBtn.addEventListener('click', resetViewer);

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    }
});

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processImage(file);
    }
}

function resetViewer() {
    dropZone.style.display = 'block';
    imagePreviewContainer.classList.remove('visible');
    exifEmpty.style.display = 'block';
    loading.classList.remove('visible');
    noExif.classList.remove('visible');
    exifData.style.display = 'none';
    fileInput.value = '';

    if (map) {
        map.remove();
        map = null;
    }
}

function processImage(file) {
    // Show loading state
    dropZone.style.display = 'none';
    imagePreviewContainer.classList.add('visible');
    exifEmpty.style.display = 'none';
    loading.classList.add('visible');
    noExif.classList.remove('visible');
    exifData.style.display = 'none';

    // Preview image
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Extract EXIF
    EXIF.getData(file, function () {
        const allTags = EXIF.getAllTags(this);
        loading.classList.remove('visible');

        if (Object.keys(allTags).length === 0) {
            noExif.classList.add('visible');
            // Still show file info
            showFileInfo(file, {});
            fileInfo.classList.add('visible');
            exifData.style.display = 'block';
            return;
        }

        displayExifData(file, allTags);
    });
}

function showFileInfo(file, tags) {
    const width = tags.PixelXDimension || tags.ImageWidth || '—';
    const height = tags.PixelYDimension || tags.ImageHeight || '—';
    const dimensions = (width !== '—' && height !== '—') ? `${width} × ${height}` : '—';

    fileInfoGrid.innerHTML = `
        <div class="file-info-item">
            <div class="file-info-label">File Name</div>
            <div class="file-info-value">${escapeHtml(file.name)}</div>
        </div>
        <div class="file-info-item">
            <div class="file-info-label">File Size</div>
            <div class="file-info-value">${formatFileSize(file.size)}</div>
        </div>
        <div class="file-info-item">
            <div class="file-info-label">File Type</div>
            <div class="file-info-value">${file.type || 'Unknown'}</div>
        </div>
        <div class="file-info-item">
            <div class="file-info-label">Dimensions</div>
            <div class="file-info-value">${dimensions}</div>
        </div>
    `;
    fileInfo.classList.add('visible');
}

function displayExifData(file, tags) {
    exifData.style.display = 'block';
    exifSections.innerHTML = '';

    // File info
    showFileInfo(file, tags);

    // Check for GPS
    const gpsLat = tags.GPSLatitude;
    const gpsLon = tags.GPSLongitude;
    const gpsLatRef = tags.GPSLatitudeRef;
    const gpsLonRef = tags.GPSLongitudeRef;

    if (gpsLat && gpsLon) {
        const lat = convertDMSToDD(gpsLat, gpsLatRef);
        const lon = convertDMSToDD(gpsLon, gpsLonRef);
        showMap(lat, lon);
    } else {
        mapSection.classList.remove('visible');
    }

    // Check for thumbnail
    const thumbnail = tags.thumbnail;
    if (thumbnail && thumbnail.blob) {
        const url = URL.createObjectURL(thumbnail.blob);
        thumbnailImage.src = url;
        thumbnailInfo.innerHTML = `
            <strong>Embedded EXIF Thumbnail</strong>
            ${thumbnail.width ? `Size: ${thumbnail.width} × ${thumbnail.height}` : ''}
        `;
        thumbnailSection.classList.add('visible');
    } else {
        thumbnailSection.classList.remove('visible');
    }

    // Categorize tags
    const categories = categorizeTags(tags);

    for (const [category, data] of Object.entries(categories)) {
        if (data.tags.length === 0) continue;
        createSection(category, data.icon, data.tags);
    }
}

function categorizeTags(tags) {
    const categories = {
        camera: { icon: '📷', tags: [], title: 'Camera & Lens' },
        settings: { icon: '⚙️', tags: [], title: 'Exposure Settings' },
        datetime: { icon: '🕐', tags: [], title: 'Date & Time' },
        gps: { icon: '🌍', tags: [], title: 'GPS Data' },
        image: { icon: '🖼️', tags: [], title: 'Image Properties' },
        software: { icon: '💻', tags: [], title: 'Software' },
        other: { icon: '📋', tags: [], title: 'All Raw Tags' }
    };

    const cameraKeys = ['Make', 'Model', 'LensModel', 'LensMake', 'LensSpecification', 'BodySerialNumber'];
    const settingsKeys = ['ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'ExposureProgram', 'ExposureMode', 'ExposureBias', 'ExposureBiasValue', 'MeteringMode', 'Flash', 'FocalLength', 'FocalLengthIn35mmFormat', 'WhiteBalance', 'ShutterSpeedValue', 'ApertureValue', 'BrightnessValue', 'MaxApertureValue', 'SubjectDistance', 'LightSource', 'SceneType', 'SceneCaptureType', 'Contrast', 'Saturation', 'Sharpness', 'DigitalZoomRatio', 'GainControl', 'SubjectDistanceRange'];
    const datetimeKeys = ['DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'SubSecTime', 'SubSecTimeOriginal', 'SubSecTimeDigitized', 'OffsetTime', 'OffsetTimeOriginal', 'OffsetTimeDigitized'];
    const gpsKeys = ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitude', 'GPSAltitudeRef', 'GPSTimeStamp', 'GPSDateStamp', 'GPSSpeed', 'GPSSpeedRef', 'GPSImgDirection', 'GPSImgDirectionRef', 'GPSDestBearing', 'GPSDestBearingRef', 'GPSHPositioningError', 'GPSVersionID'];
    const imageKeys = ['ImageWidth', 'ImageHeight', 'PixelXDimension', 'PixelYDimension', 'Orientation', 'XResolution', 'YResolution', 'ResolutionUnit', 'ColorSpace', 'BitsPerSample', 'Compression', 'PhotometricInterpretation', 'SamplesPerPixel', 'PlanarConfiguration', 'YCbCrSubSampling', 'YCbCrPositioning', 'ComponentsConfiguration'];
    const softwareKeys = ['Software', 'ProcessingSoftware', 'Artist', 'Copyright', 'ImageDescription', 'UserComment', 'MakerNote'];

    for (const [key, value] of Object.entries(tags)) {
        if (key === 'thumbnail' || key === 'MakerNote') continue;

        const tagData = { key, value, formatted: formatValue(key, value) };

        if (cameraKeys.includes(key)) {
            categories.camera.tags.push(tagData);
        } else if (settingsKeys.includes(key)) {
            categories.settings.tags.push(tagData);
        } else if (datetimeKeys.includes(key)) {
            categories.datetime.tags.push(tagData);
        } else if (gpsKeys.includes(key)) {
            categories.gps.tags.push(tagData);
        } else if (imageKeys.includes(key)) {
            categories.image.tags.push(tagData);
        } else if (softwareKeys.includes(key)) {
            categories.software.tags.push(tagData);
        }

        // Always add to "All Raw Tags"
        categories.other.tags.push(tagData);
    }

    return categories;
}

function createSection(key, icon, tags) {
    const categories = {
        camera: 'Camera & Lens',
        settings: 'Exposure Settings',
        datetime: 'Date & Time',
        gps: 'GPS Data',
        image: 'Image Properties',
        software: 'Software',
        other: 'All Raw Tags'
    };

    const section = document.createElement('div');
    section.className = 'exif-section';

    const isCollapsed = key === 'other' ? 'collapsed' : '';

    section.innerHTML = `
        <div class="section-header ${isCollapsed}">
            <span class="section-icon">${icon}</span>
            <span class="section-title">${categories[key]}</span>
            <span class="section-count">${tags.length}</span>
            <span class="section-toggle">▼</span>
        </div>
        <div class="section-content">
            ${tags.map(tag => `
                <div class="exif-row">
                    <div class="exif-key">${escapeHtml(tag.key)}</div>
                    <div class="exif-value">
                        ${escapeHtml(tag.formatted)}
                        ${tag.formatted !== String(tag.value) ? `<span class="exif-value-raw">Raw: ${escapeHtml(formatRawValue(tag.value))}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    section.querySelector('.section-header').addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('collapsed');
    });

    exifSections.appendChild(section);
}

function formatValue(key, value) {
    // Human-readable formatting for common EXIF tags
    const formatters = {
        ExposureTime: (v) => {
            if (typeof v === 'number') {
                return v >= 1 ? `${v}s` : `1/${Math.round(1 / v)}s`;
            }
            return String(v);
        },
        FNumber: (v) => `f/${v}`,
        ISOSpeedRatings: (v) => `ISO ${v}`,
        FocalLength: (v) => `${v}mm`,
        FocalLengthIn35mmFormat: (v) => `${v}mm (35mm equiv.)`,
        ExposureProgram: (v) => {
            const programs = {
                0: 'Not defined', 1: 'Manual', 2: 'Program AE', 3: 'Aperture Priority',
                4: 'Shutter Priority', 5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape'
            };
            return programs[v] || String(v);
        },
        MeteringMode: (v) => {
            const modes = {
                0: 'Unknown', 1: 'Average', 2: 'Center-weighted', 3: 'Spot',
                4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other'
            };
            return modes[v] || String(v);
        },
        Flash: (v) => {
            const fired = (v & 1) ? 'Fired' : 'Did not fire';
            return fired;
        },
        WhiteBalance: (v) => v === 0 ? 'Auto' : 'Manual',
        ExposureMode: (v) => {
            const modes = { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' };
            return modes[v] || String(v);
        },
        Orientation: (v) => {
            const orientations = {
                1: 'Normal', 2: 'Flipped horizontal', 3: 'Rotated 180°',
                4: 'Flipped vertical', 5: 'Rotated 90° CCW, flipped',
                6: 'Rotated 90° CW', 7: 'Rotated 90° CW, flipped', 8: 'Rotated 90° CCW'
            };
            return orientations[v] || String(v);
        },
        ColorSpace: (v) => v === 1 ? 'sRGB' : v === 65535 ? 'Uncalibrated' : String(v),
        ResolutionUnit: (v) => {
            const units = { 1: 'None', 2: 'inches', 3: 'centimeters' };
            return units[v] || String(v);
        },
        SceneCaptureType: (v) => {
            const types = { 0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night' };
            return types[v] || String(v);
        },
        Contrast: (v) => {
            const vals = { 0: 'Normal', 1: 'Soft', 2: 'Hard' };
            return vals[v] || String(v);
        },
        Saturation: (v) => {
            const vals = { 0: 'Normal', 1: 'Low', 2: 'High' };
            return vals[v] || String(v);
        },
        Sharpness: (v) => {
            const vals = { 0: 'Normal', 1: 'Soft', 2: 'Hard' };
            return vals[v] || String(v);
        },
        GPSAltitude: (v) => `${v.toFixed(1)}m`,
        GPSAltitudeRef: (v) => v === 0 ? 'Above sea level' : 'Below sea level',
        ExposureBiasValue: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} EV`,
        MaxApertureValue: (v) => `f/${Math.pow(2, v / 2).toFixed(1)}`,
        LightSource: (v) => {
            const sources = {
                0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten',
                4: 'Flash', 9: 'Fine weather', 10: 'Cloudy', 11: 'Shade',
                12: 'Daylight fluorescent', 13: 'Day white fluorescent',
                14: 'Cool white fluorescent', 15: 'White fluorescent', 17: 'Standard A',
                18: 'Standard B', 19: 'Standard C', 20: 'D55', 21: 'D65', 22: 'D75',
                23: 'D50', 24: 'ISO studio tungsten', 255: 'Other'
            };
            return sources[v] || String(v);
        },
        GPSLatitude: (v) => formatGPSCoord(v, 'lat'),
        GPSLongitude: (v) => formatGPSCoord(v, 'lon')
    };

    if (formatters[key]) {
        try {
            return formatters[key](value);
        } catch (e) {
            return String(value);
        }
    }

    if (Array.isArray(value)) {
        return value.join(', ');
    }

    return String(value);
}

function formatRawValue(value) {
    if (Array.isArray(value)) {
        return `[${value.join(', ')}]`;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function formatGPSCoord(dms, type) {
    if (!Array.isArray(dms) || dms.length !== 3) return String(dms);
    const [d, m, s] = dms;
    return `${d}° ${m}' ${s.toFixed(2)}"`;
}

function convertDMSToDD(dms, ref) {
    if (!Array.isArray(dms) || dms.length !== 3) return null;
    const [d, m, s] = dms;
    let dd = d + m / 60 + s / 3600;
    if (ref === 'S' || ref === 'W') dd *= -1;
    return dd;
}

function showMap(lat, lon) {
    mapSection.classList.add('visible');

    // Initialize or update map
    setTimeout(() => {
        if (map) {
            map.remove();
        }

        map = L.map('map').setView([lat, lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        marker = L.marker([lat, lon]).addTo(map);

        // Show coordinates with link
        const latStr = lat.toFixed(6);
        const lonStr = lon.toFixed(6);
        mapCoords.innerHTML = `
            <span>${latStr}, ${lonStr}</span>
            <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
        `;
    }, 100);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Register service worker for offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
