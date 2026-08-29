"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";

interface ManagementPosterModalProps {
  onClose: () => void;
}

export function ManagementPosterModal({ onClose }: ManagementPosterModalProps) {
  const { t, dir } = useLocale();

  return (
    <div
      className="mgmt-poster-overlay"
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={t.archiveSoftwareLink}
      onClick={onClose}
    >
      <div
        className="mgmt-poster-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="mgmt-poster-close"
          onClick={onClose}
          aria-label={t.closeTrailer}
        >
          ×
        </button>
        <Link
          href="/managment"
          className="mgmt-poster-link"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          <Image
            className="mgmt-poster-image"
            src="/moodyfilm-management-poster.png"
            alt={t.archiveSoftwareLink}
            width={1080}
            height={1350}
            priority
            sizes="(max-width: 900px) 92vw, 840px"
          />
        </Link>
      </div>
    </div>
  );
}
