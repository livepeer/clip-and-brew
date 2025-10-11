import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Gallery } from "./components/Gallery";
import { Landing } from "./components/Landing";
import { Login } from "./components/Login";
import { Header } from "./components/Header";
import Capture from "./pages/Capture";
import ClipView from "./pages/ClipView";
import ImageTransform from "./pages/ImageTransform";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/start" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/transform" element={<ImageTransform />} />
            <Route path="/clip/:id" element={<ClipView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
