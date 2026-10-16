const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const groupRoutes = require("./routes/groupRoutes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173"
  })
);

app.use(express.json());

// Root health-check endpoint
app.get("/", (req, res) => {
  res.json({ message: "SplitMate API is running!" });
});

// API v1 Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/groups", groupRoutes);

// Catch-all 404 handler for undefined API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Global centralized error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully!");

    const server = app.listen(PORT, () => {
      console.log(`SplitMate API running at http://localhost:${PORT}`);
    });

    return server;
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
