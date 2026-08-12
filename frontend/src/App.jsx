import "./App.css";
import { useState } from "react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";

function App() {
  const [originInput, setOriginInput] = useState("");
  const [destinationInput, setDestinationInput] = useState("");

  const [originLat, setOriginLat] = useState("");
  const [originLon, setOriginLon] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLon, setDestLon] = useState("");

  const [itineraryData, setItineraryData] = useState(null);

  return (
    <div className="h-screen text-gray-900 flex flex-col">
      {/* <Navbar /> */}
      <div className="flex flex-row flex-1 overflow-hidden">
        <Sidebar
          originInput={originInput}
          setOriginInput={setOriginInput}
          destinationInput={destinationInput}
          setDestinationInput={setDestinationInput}

          originLat={originLat}
          setOriginLat={setOriginLat}
          originLon={originLon}
          setOriginLon={setOriginLon}

          destLat={destLat}
          setDestLat={setDestLat}
          destLon={destLon}
          setDestLon={setDestLon}

          itineraryData={itineraryData}
          setItineraryData={setItineraryData}
        />
        <div className="flex-1">
          <MapView
            itineraryData={itineraryData}
            setOriginLat={setOriginLat}
            setOriginLon={setOriginLon}
            setDestLat={setDestLat}
            setDestLon={setDestLon}
            setOriginInput={setOriginInput}
            setDestinationInput={setDestinationInput}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
