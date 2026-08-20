import { Route, Routes, Navigate } from "react-router-dom"
import Editor from "./Editor.jsx"
import HomePage from "./HomePage.jsx"
import { diffUpdateV2 } from "yjs"
import { useParams } from "react-router-dom";
import AuthPage from "./AuthPage.jsx";
import DashboardPage from "./DashboardPage.jsx";

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
         <Route path="/login" element={<AuthPage />} />
         <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </>
  )
}


export default App
