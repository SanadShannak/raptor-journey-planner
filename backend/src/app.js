const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const logger = require("./utils/logger");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const helmet = require("helmet");

const validDatesApi = require("./routes/validDatesApi");
const plannerApi = require("./routes/plannerApi");
const stopsApi = require("./routes/stopsApi");
const networkApi = require("./routes/networkApi");
const routesApi = require("./routes/routesApi");
const authApi = require("./routes/authApi");
const cardApi = require("./routes/cardApi");
const userApi = require("./routes/userApi");

const app = express();

/*
 * One line per request, and first in the chain so it times all of it and
 * sees requests that later middleware rejects — a body that is not JSON
 * never reaches a route, but it still gets logged with its own id.
 *
 * What a request line carries is chosen here rather than left to the
 * default, which logs the full URL, query, headers and remote port:
 *
 * - The **path without its query string**. The planner's query is a
 *   traveller's origin and destination as coordinates, and coordinates are
 *   personal data — they do not go in a log.
 * - **No headers**. The session cookie is the whole of somebody's login.
 *
 * Levels follow the outcome, so `warn` and above is exactly the requests that
 * need reading: a 5xx is an error, a 4xx a warning, everything else info.
 * The health check is not logged at all — Docker asks it every 30 seconds.
 */

app.set("trust proxy", 2);

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        path: req.url.split("?")[0],
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);
app.use(helmet());
app.use(cors({ credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "active", message: "API infrastructure active." });
});

app.use("/api/valid-dates", validDatesApi);
app.use("/api/planner", plannerApi);
app.use("/api/stop", stopsApi);
app.use("/api/stops", stopsApi);
app.use("/api/network", networkApi);
app.use("/api/routes", routesApi);
app.use("/api/auth", authApi);
app.use("/api/cards", cardApi);
app.use("/api/user", userApi);

app.get("/", (req, res) => {
  res.redirect("/api/health");
});

app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
