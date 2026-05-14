const express = require("express");
const router = express.Router();

const axios = require("axios");

const { protegerPanel } = require("../middlewares/auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

router.get("/builder", protegerPanel, async (req, res) => {
  try {
    res.send("Builder funcionando ✅");
  } catch (error) {
    res.send(error.message);
  }
});

module.exports = router;