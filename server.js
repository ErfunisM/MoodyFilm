const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const hostname = "127.0.0.1";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  }).listen(port, hostname, () => {
    console.log(`Ready on http://${hostname}:${port}`);
  });
});
