import auditLogModel from "../../DB/Model/auditLog.model.js";

export const detectGeoRisk = async ({ userId, country, city }) => {
  const lastLogin = await auditLogModel
    .findOne({
      actorId: userId,
      action: "auth.login.success",
    })
    .sort({ createdAt: -1 });

  if (!lastLogin) {
    return {
      risk: "LOW",
      reason: "first_login",
    };
  }

  const lastCountry = lastLogin.meta?.country;
  const lastCity = lastLogin.meta?.city;

  if (
    lastCountry &&
    country &&
    lastCountry !== country &&
    lastCountry !== "Local"
  ) {
    return {
      risk: "HIGH",
      reason: `country_changed_${lastCountry}_to_${country}`,
    };
  }

  if (lastCity && city && lastCity !== city && lastCity !== "Localhost") {
    return {
      risk: "MEDIUM",
      reason: `city_changed_${lastCity}_to_${city}`,
    };
  }

  return {
    risk: "LOW",
    reason: "same_location",
  };
};
