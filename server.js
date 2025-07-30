import express from "express";
import cors from "cors";
import ytdl from "ytdl-core";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public")); // <<--- Esto sirve index.html automáticamente

// Ruta para obtener información de un video
app.get("/api/info", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ error: "Falta el parámetro url" });

  const info = await ytdl.getInfo(videoUrl);
  res.json({
    title: info.videoDetails.title,
    channel: info.videoDetails.author.name,
    duration: info.videoDetails.lengthSeconds,
    thumbnail: info.videoDetails.thumbnails.pop().url,
  });
});

// Ruta para descargar
app.get("/api/download", async (req, res) => {
  const { url, format } = req.query;
  if (!url) return res.status(400).send("Falta el parámetro url");

  let contentType = "video/mp4";
  if (format === "mp3") {
    contentType = "audio/mpeg";
  }

  res.header("Content-Disposition", `attachment; filename="video.${format || "mp4"}"`);
  res.header("Content-Type", contentType);

  const stream = ytdl(url, { quality: format === "mp3" ? "highestaudio" : "highestvideo" });
  stream.pipe(res);
});

// No pongas ningún app.get("/") manual, express.static se encarga

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
