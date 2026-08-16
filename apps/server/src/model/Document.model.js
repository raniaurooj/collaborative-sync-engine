import mongoose from "mongoose";

const collaboratorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["editor", "viewer"], required: true },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, default: "Untitled" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    collaborators: [collaboratorSchema],
  },
  { timestamps: true }
);

documentSchema.methods.roleFor = function (userId) {
  const uid = userId.toString();
  if (this.owner.toString() === uid) return "editor";
  const collab = this.collaborators.find((c) => c.user.toString() === uid);
  return collab ? collab.role : null; 
}
export default mongoose.model("Document", documentSchema)