export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");

  res.status(200).json({
    message: "Hello from Vercel API 🚀",
    method: req.method
  });
}