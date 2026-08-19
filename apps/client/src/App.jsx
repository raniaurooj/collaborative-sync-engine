import { Route, Routes, Navigate } from "react-router-dom"
import Editor from "./Editor.jsx"
import HomePage from "./HomePage.jsx"
import { diffUpdateV2 } from "yjs"
import { useParams } from "react-router-dom";

function App() {

  function StartGuestWriting() {
    const guestRoomId = `guest-${crypto.randomUUID()}`;
    return <Navigate to={`/write/${guestRoomId}`} replace />;
  }
  function EditorRoute() {
    const { roomId } = useParams();
    return <Editor roomId={roomId} />;
  }

  return (
    <>
      <Routes>
         <Route path="/" element={<HomePage/>} />
         <Route path="/write" element={<StartGuestWriting />}/>
         <Route path="/write/:roomId" element={<EditorRoute/>}/>
         <Route path="/login" element={<div>Login Page - comming next</div>} />
      </Routes>
    </>
  )
}


export default App
