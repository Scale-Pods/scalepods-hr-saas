import Image from "next/image";

export interface LoadingScreenProps {
  message?: string;
  showLogo?: boolean;
}

export function LoadingScreen({
  message = "Establishing secure connection...",
  showLogo = true,
}: LoadingScreenProps) {
  return (
    <div className="login-overlay active-loading">
      {showLogo && (
        <div className="mb-6 flex justify-center">
          <Image
            src="/brand/scalepods-navbar-logo.png"
            alt="ScalePods"
            width={160}
            height={38}
            priority
            className="h-8 w-auto object-contain brightness-0 invert opacity-95"
          />
        </div>
      )}
      <div className="login-loader" />
      <div className="login-loader-text">{message}</div>
    </div>
  );
}
