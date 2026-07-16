import { useEffect } from "react";

export default function CustomerService() {
  useEffect(() => {
    document.title = "NOSH POS Customer Service Request";

    const script = document.createElement("script");
    script.src = "https://tally.so/widgets/embed.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="relative h-screen">
        <iframe
          data-tally-src="https://tally.so/r/xX1Lgk"
          title="NOSH POS Customer Service Request"
          className="absolute inset-0 w-full h-full border-0"
          frameBorder="0"
          marginHeight="0"
          marginWidth="0"
        />
      </div>
    </div>
  );
}
