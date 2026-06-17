import axios from "axios";

export const getGeoLocation = async (ip) => {
  try {
    // معالجة localhost
    if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.includes("192.168")) {
      return {
        country: "Local",
        city: "Localhost",
        proxy: false,
      };
    }

    const { data } = await axios.get(
      `http://ip-api.com/json/${ip}?fields=status,country,city,proxy,hosting`,
    );

    if (data.status !== "success") {
      return null;
    }

    return {
      country: data.country,
      city: data.city,
      proxy: data.proxy,
      hosting: data.hosting,
    };
  } catch (error) {
    return null;
  }
};
