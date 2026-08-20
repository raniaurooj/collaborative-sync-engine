import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import Quill from "quill";
import { QuillBinding } from "y-quill";
import "quill/dist/quill.snow.css";
import { YjsWebsocketProvider } from "./YjsWebsocketProvider";
import ImageCropModal from "./ImageCropModal";
import BlotFormatter from "@enzedonline/quill-blot-formatter2";
import "@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css";
import QuillCursors from "quill-cursors";
import { getToken } from "./lib/auth";

Quill.register("modules/cursors", QuillCursors);
Quill.register("modules/blotFormatter2", BlotFormatter);

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  ["link", "image"],
  ["blockquote", "code-block"],
  ["clean"],
];

async function uploadImageToCloudinary(file) {
  const sigRes = await fetch("http://localhost:4000/upload/signature");
  if (!sigRes.ok) {
    throw new Error(`Failed to get upload signature (${sigRes.status})`);
  }

  const { signature, timestamp, folder, apiKey, cloudName } = await sigRes.json();
  if (!signature || !timestamp || !apiKey || !cloudName) {
    throw new Error(
      "Upload signature response is missing fields — check server env vars (see console)."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("signature", signature);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  const data = await uploadRes.json();

  if (!uploadRes.ok) {
    throw new Error(data?.error?.message || "Cloudinary upload failed");
  }

  return data.secure_url;
}

export default function Editor({ roomId = "default" }) {
  const editorContainerRef = useRef(null);
  const [status, setStatus] = useState("connecting...");
  const [uploadStatus, setUploadStatus] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const pendingInsertRef = useRef(null);
  const [title, setTitle] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const isRealDoc = !roomId.startsWith("guest-") && roomId !== "default";

  function openCropForFile(file, quill, range) {
    const objectUrl = URL.createObjectURL(file);
    pendingInsertRef.current = { quill, range };
    setCropSrc(objectUrl);
  }

  async function handleCropConfirm(blob) {
    const { quill, range } = pendingInsertRef.current;
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setUploadStatus("uploading");

    try {
      const url = await uploadImageToCloudinary(blob);
      quill.insertEmbed(range.index, "image", url, "user");
      quill.setSelection(range.index + 1);
      setUploadStatus(null);
    } catch (err) {
      console.error("Image upload failed:", err.message);
      setUploadStatus("error");
      setTimeout(() => setUploadStatus(null), 3000);
    }
  }

  function handleCropCancel() {
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    pendingInsertRef.current = null;
  }

  useEffect(() => {
    if (!editorContainerRef.current) return;
    editorContainerRef.current.innerHTML = "";

    const doc = new Y.Doc();
    const yText = doc.getText("quill-content");

    const quill = new Quill(editorContainerRef.current, {
      theme: "snow",
      placeholder: "Start typing...",
      modules: {
        toolbar: {
          container: TOOLBAR_OPTIONS,
          handlers: {
            image: function () {
              const input = document.createElement("input");
              input.setAttribute("type", "file");
              input.setAttribute("accept", "image/*");
              input.click();

              input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;
                const range = quill.getSelection(true);
                openCropForFile(file, quill, range);
              };
            },
          },
        },
        blotFormatter2: {},
        cursors: true,
      },
    });

    const toolbarEl = quill.getModule("toolbar").container;
    
    const provider = new YjsWebsocketProvider(doc, roomId);
    provider.onStatusChange = (s) => setStatus(s);
    provider.onRoleChange = (role) => {
      quill.enable(role === "editor");
    };
    const binding = new QuillBinding(yText, quill, provider.awareness);
    provider.connect();

    return () => {
      binding.destroy();
      provider.destroy();
      doc.destroy();
      toolbarEl?.remove();
      if (editorContainerRef.current) {
        editorContainerRef.current.innerHTML = "";
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!isRealDoc) return;
    fetch(`http://localhost:4000/documents/${roomId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => res.json())
      .then((data) => setTitle(data.title))
      .catch(() => setTitle("Untitled"));
  }, [roomId, isRealDoc]);

  async function handleTitleSave() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === title) return;

    try {
      const res = await fetch(`http://localhost:4000/documents/${roomId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (res.ok) setTitle(data.title);
    } catch {

    }
  }

  const isConnected = status.startsWith("connected");

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          {isRealDoc ? (
            editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="rounded border border-stone-300 bg-white px-2 py-1 text-lg font-semibold outline-none focus:border-stone-500"
              />
            ) : (
              <h1
                onClick={() => {
                  setTitleDraft(title || "");
                  setEditingTitle(true);
                }}
                className="cursor-text text-lg font-semibold hover:underline sm:text-xl"
                title="Click to rename"
              >
                {title || "Loading..."}
              </h1>
            )
          ) : (
            <h1 className="text-lg font-semibold sm:text-xl">Untitled Session</h1>
          )}

          <div className="flex items-center gap-3 self-start">
            {uploadStatus === "uploading" && (
              <span className="text-xs font-mono text-slate-500">
                Uploading image…
              </span>
            )}
            {uploadStatus === "error" && (
              <span className="text-xs font-mono text-red-500">
                Upload failed
              </span>
            )}

            <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isConnected ? "bg-amber-400 animate-ping" : "bg-red-500"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isConnected ? "bg-amber-400" : "bg-red-500"
                  }`}
                />
              </span>
              <span className="font-mono text-xs text-slate-700 truncate max-w-[180px] sm:max-w-none">
                {status}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between text-sm font-mono text-slate-500">
          <span>room: {roomId}</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl">
          <div ref={editorContainerRef} className="min-h-[300px] sm:min-h-[420px]" />
        </div>

        {cropSrc && (
          <ImageCropModal
            imageSrc={cropSrc}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />
        )}
      </div>
    </div>
  );
}