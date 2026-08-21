"use client";

import { CheckCircle2, CircleAlert, Info, Loader2, XCircle } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      richColors
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <CircleAlert className="size-4" />,
        error: <XCircle className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
