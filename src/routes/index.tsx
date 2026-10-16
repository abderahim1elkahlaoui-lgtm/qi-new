import { createFileRoute } from "@tanstack/react-router";
import WhatsApp from "@/components/WhatsApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QI New — Free AI chat for fiqh & everything" },
      { name: "description", content: "QI New: a free WhatsApp-style AI assistant answering Islamic fiqh questions per the four schools, and any other topic, in your language." },
      { property: "og:title", content: "QI New — Free AI chat for fiqh & everything" },
      { property: "og:description", content: "WhatsApp-style AI assistant: fiqh per the four schools, voice, stickers, images, in any language." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WhatsApp,
});
