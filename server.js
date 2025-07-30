const express = require('express');
const cors = require('cors');
const { exec } = require('child_process'); // Importa 'exec' para ejecutar comandos de línea de comandos
const path = require('path');             // Para manejar rutas de archivos
const fs = require('fs');                 // Para manejar el sistema de archivos (borrar archivos temporales)

const app = express();
const port = 3000;

// Configura una carpeta para almacenar archivos temporales de descarga y conversión
// Asegúrate de que esta carpeta exista y tenga permisos de escritura para tu servidor.
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}
console.log('Ruta absoluta de TEMP_DIR:', TEMP_DIR); // <-- ¡Aquí es donde debe ir, solo una vez!

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sirve archivos estáticos
// Cuando yt-dlp descargue un archivo, lo pondrá en TEMP_DIR.
// El frontend necesitará acceder a esos archivos para que el usuario los descargue.
app.use('/downloads', express.static(TEMP_DIR));

// Ruta de prueba (GET)
app.get('/', (req, res) => {
    res.send('¡Servidor de descarga de videos funcionando!');
});

// Ruta para manejar la solicitud de descarga (POST)
app.post('/download', async (req, res) => {
    const videoUrl = req.body.url;

    if (!videoUrl) {
        return res.status(400).json({ success: false, error: 'Falta la URL del video.' });
    }

    console.log(`Recibida solicitud para descargar video de: ${videoUrl}`);

    try {
        // 1. Obtener información del video con yt-dlp (formatos disponibles, título, etc.)
        const infoCommand = `yt-dlp --dump-json --no-warnings "${videoUrl}"`;
        console.log(`Ejecutando: ${infoCommand}`);

        const { stdout: infoOutput, stderr: infoError } = await new Promise((resolve, reject) => {
            exec(infoCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error al obtener información de yt-dlp: ${stderr}`);
                    return reject(new Error(`No se pudo obtener información del video: ${stderr}`));
                }
                resolve({ stdout, stderr });
            });
        });

        const videoInfo = JSON.parse(infoOutput);
        const videoTitle = videoInfo.title.replace(/[^a-z0-9\s-]/gi, '_').replace(/\s+/g, '-'); // Sanitizar título

        const availableFormats = [];

        // Añadir una opción MP4 de alta calidad (combinando video y audio)
        const bestMp4 = videoInfo.formats.find(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none' && f.height);
        if (bestMp4) {
            availableFormats.push({
                format: `MP4 ${bestMp4.height}p`,
                itag: bestMp4.format_id,
                ext: 'mp4'
            });
        } else {
             // Si no hay MP4 con video+audio, buscar la mejor calidad general si existe
            const genericMp4 = videoInfo.formats.find(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none');
            if (genericMp4) {
                availableFormats.push({
                    format: `MP4 ${genericMp4.format_note || ''}`,
                    itag: genericMp4.format_id,
                    ext: 'mp4'
                });
            }
        }

        // Añadir una opción MP3
        const bestAudio = videoInfo.formats.find(f => f.acodec !== 'none' && f.vcodec === 'none' && (f.ext === 'm4a' || f.ext === 'webm' || f.ext === 'mp3'));
        if (bestAudio) {
             availableFormats.push({
                format: 'MP3 (Audio)',
                itag: bestAudio.format_id,
                ext: 'mp3' // Indicamos que queremos el output en MP3
            });
        }

        if (availableFormats.length === 0) {
            return res.status(404).json({ success: false, error: 'No se encontraron formatos de video o audio MP4/MP3 compatibles para esta URL.' });
        }

        // 2. Generar enlaces de descarga para los formatos identificados
        const downloadLinks = await Promise.all(availableFormats.map(async (f) => {
            const outputFilename = `${videoTitle}_${f.format.replace(/\s/g, '_').toLowerCase()}.${f.ext}`;
            const outputPath = path.join(TEMP_DIR, outputFilename);

            let downloadCommand;

            if (f.ext === 'mp3') {
                // Descargar el audio y convertirlo a MP3 usando FFmpeg
                downloadCommand = `yt-dlp -f ${f.itag} -x --audio-format mp3 -o "${outputPath}" "${videoUrl}"`;
            } else {
                // Descargar el video (y audio si es un formato combinado)
                downloadCommand = `yt-dlp -f ${f.itag} -o "${outputPath}" "${videoUrl}"`;
            }

            console.log(`Ejecutando descarga para ${f.format}: ${downloadCommand}`);

            await new Promise((resolve, reject) => {
                exec(downloadCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error al descargar/convertir ${f.format}: ${stderr}`);
                        if (fs.existsSync(outputPath)) {
                            fs.unlinkSync(outputPath); // Intentar borrar el archivo parcial
                        }
                        return reject(new Error(`Fallo la descarga/conversión para ${f.format}: ${stderr}`));
                    }
                    console.log(`Descarga/Conversión exitosa para ${f.format}`);
                    resolve();
                });
            });

            // Devolver la URL pública para el frontend
            return {
                format: f.format,
                size: 'Tamaño no disponible',
                url: `/downloads/${outputFilename}`
            };
        }));

        res.json({ success: true, results: downloadLinks });

    } catch (error) {
        console.error('Error general en el backend:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor backend escuchando en http://localhost:${port}`);
    console.log(`Carpeta de descargas temporales: ${TEMP_DIR}`);
    console.log(`¡Listo para procesar videos!`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('Excepción no capturada:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa no manejada:', reason);
});