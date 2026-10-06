import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  name?: string;
  type?: string;
  url?: string;
}

export function SEO({
  title = "TN Ride — #1 Bike Taxi & Auto Booking in Kallakurichi",
  description = "TN Ride is Kallakurichi's #1 bike taxi, auto rickshaw booking, and parcel delivery app. Book instant rides starting at ₹10.",
  keywords = "TN Ride, kallakurichi ride, bike taxi kallakurichi, auto booking kallakurichi",
  name = "TN Ride",
  type = "website",
  url = "https://adhaiyur-ride.vercel.app/",
}: SEOProps) {
  return (
    <Helmet>
      {/* Standard metadata tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* OpenGraph tags */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={name} />

      {/* Twitter tags */}
      <meta name="twitter:creator" content={name} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
