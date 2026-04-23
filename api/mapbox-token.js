export default function handler(req, res) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'MAPBOX_TOKEN environment variable is not set in Vercel.' });
  }
  res.status(200).json({ token });
}