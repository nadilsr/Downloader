// server.js - Video Downloader Backend
// Install dependencies: npm install express cors ytdl-core @distube/ytdl-core instagram-url-direct

const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const { instagramGetUrl } = require('instagram-url-direct');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// YouTube Info Endpoint
app.post('/api/youtube/info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ 
                error: 'Invalid YouTube URL' 
            });
        }

        const info = await ytdl.getInfo(url);
        const formats = ytdl.filterFormats(info.formats, 'videoandaudio');

        // Extract quality options
        const qualities = formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || format.quality,
            format: format.container,
            size: format.contentLength ? 
                `${(parseInt(format.contentLength) / (1024 * 1024)).toFixed(2)} MB` : 
                'Unknown',
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo
        }));

        // Remove duplicates and sort by quality
        const uniqueQualities = qualities.filter((quality, index, self) =>
            index === self.findIndex(q => q.quality === quality.quality)
        );

        res.json({
            success: true,
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            qualities: uniqueQualities.sort((a, b) => {
                const getResolution = (q) => {
                    const match = q.quality.match(/(\d+)p/);
                    return match ? parseInt(match[1]) : 0;
                };
                return getResolution(b) - getResolution(a);
            })
        });

    } catch (error) {
        console.error('YouTube Info Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch video information',
            details: error.message 
        });
    }
});

// YouTube Download Endpoint
app.post('/api/youtube/download', async (req, res) => {
    try {
        const { url, itag } = req.body;

        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ 
                error: 'Invalid YouTube URL' 
            });
        }

        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');

        res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
        res.header('Content-Type', 'video/mp4');

        const videoStream = ytdl(url, {
            quality: itag || 'highest',
            filter: 'videoandaudio'
        });

        videoStream.pipe(res);

        videoStream.on('error', (error) => {
            console.error('Stream Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Download failed',
                    details: error.message 
                });
            }
        });

    } catch (error) {
        console.error('YouTube Download Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to download video',
                details: error.message 
            });
        }
    }
});

// Instagram Info Endpoint
app.post('/api/instagram/info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || !url.includes('instagram.com')) {
            return res.status(400).json({ 
                error: 'Invalid Instagram URL' 
            });
        }

        const result = await instagramGetUrl(url);

        if (!result || !result.url_list) {
            return res.status(404).json({ 
                error: 'Could not fetch Instagram video' 
            });
        }

        // Instagram usually provides multiple quality options
        const qualities = result.url_list.map((urlItem, index) => ({
            url: urlItem,
            quality: index === 0 ? '1080p (Full HD)' : 
                     index === 1 ? '720p (HD)' : '480p',
            format: 'mp4',
            size: 'Unknown' // Instagram doesn't provide size info
        }));

        res.json({
            success: true,
            thumbnail: result.thumbnail || result.url_list[0],
            qualities: qualities
        });

    } catch (error) {
        console.error('Instagram Info Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch Instagram video',
            details: error.message 
        });
    }
});

// Instagram Download Endpoint
app.post('/api/instagram/download', async (req, res) => {
    try {
        const { url, qualityUrl } = req.body;

        if (!qualityUrl) {
            return res.status(400).json({ 
                error: 'Quality URL is required' 
            });
        }

        // Fetch the video
        const response = await fetch(qualityUrl);
        
        if (!response.ok) {
            throw new Error('Failed to fetch video');
        }

        const buffer = await response.arrayBuffer();

        res.header('Content-Disposition', 'attachment; filename="instagram_video.mp4"');
        res.header('Content-Type', 'video/mp4');
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('Instagram Download Error:', error);
        res.status(500).json({ 
            error: 'Failed to download video',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📺 YouTube endpoints: /api/youtube/info, /api/youtube/download`);
    console.log(`📷 Instagram endpoints: /api/instagram/info, /api/instagram/download`);
});

module.exports = app;
