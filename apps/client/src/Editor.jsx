import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import Quill from "quill";
import { QuillBinding } from "y-quill";
import "quill/dist/quill.snow.css";
import { YjsWebsocketProvider } from "./YjsWebsocketProvider";
import ImageCropModal from "./ImageCropModal";
import BlotFormatter from "@enzedonline/quill-blot-formatter2";
import "@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css";

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

export default function Editor({ roomId = "test-room-1" }) {
  const editorContainerRef = useRef(null);
  const [status, setStatus] = useState("connecting...");
  const [uploadStatus, setUploadStatus] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const pendingInsertRef = useRef(null);

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
      },
    });

    const toolbarEl = quill.getModule("toolbar").container;
    
    const binding = new QuillBinding(yText, quill);

    const provider = new YjsWebsocketProvider(doc, roomId);
    provider.onStatusChange = (s) => setStatus(s);
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

  const isConnected = status.startsWith("connected");

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold sm:text-xl">
            Collaborative Sync Engine
          </h1>

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