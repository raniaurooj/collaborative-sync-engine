import { Router } from "express"
import mongoose from "mongoose"
import Document from "../model/Document.model.js"
import User from "../model/User.model.js"
import { requireAuth } from "../auth.js"

const router = Router()
router.use(requireAuth)

router.post("/", async (req, res) => {
  try {
    const { title } = req.body;
    const doc = await Document.create({
      title: title || undefined, 
      owner: req.user.sub,
      collaborators: [],
    });
    res.status(201).json({ id: doc._id, title: doc.title, role: "editor" });
  } catch (error) {
    res.status(500).json({ error: error.message }); 
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.user.sub;
    const docs = await Document.find({
      $or: [{ owner: userId }, { "collaborators.user": userId }],
    }).sort({ updatedAt: -1 });

    res.json(
      docs.map((doc) => ({
        id: doc._id,
        title: doc.title,
        role: doc.roleFor(userId),
        updatedAt: doc.updatedAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid document id" });
    }
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const role = doc.roleFor(req.user.sub);
    if (!role) {
      return res.status(403).json({ error: "You do not have access to this document" });
    }
    res.json({ id: doc._id, title: doc.title, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/collaborators", async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !["editor", "viewer"].includes(role)) {
      return res
        .status(400)
        .json({ error: "email and a valid role ('editor' or 'viewer') are required" });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (doc.owner.toString() !== req.user.sub) {
      return res.status(403).json({ error: "Only the document owner can invite collaborators" });
    }

    const invitedUser = await User.findOne({ email: email.toLowerCase() });
    if (!invitedUser) {
      return res.status(404).json({ error: "No user found with that email" });
    }
    if (invitedUser._id.toString() === doc.owner.toString()) {
      return res.status(400).json({ error: "Owner already has full access" });
    }

    const existing = doc.collaborators.find(
      (c) => c.user.toString() === invitedUser._id.toString()
    );
    if (existing) {
      existing.role = role;
    } else {
      doc.collaborators.push({ user: invitedUser._id, role });
    }

    await doc.save();
    res.json({ id: doc._id, collaborators: doc.collaborators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;