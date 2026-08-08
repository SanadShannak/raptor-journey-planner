import "./App.css";
import { useState } from "react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

function App() {
  return (
    <div className="h-screen text-gray-900 flex flex-col">
      <Navbar />
      <div className="flex flex-row flex-1 overflow-hidden">
        <Sidebar />
      </div>
    </div>
  );
}

export default App;
