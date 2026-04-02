use serde::Deserialize;

pub const EXPECTED_LICENSE_SIGNATURE_ALGORITHM: &str = "Ed25519";
pub const EXPECTED_LICENSE_CANONICALIZATION_VERSION: u32 = 1;
pub const EXPECTED_LICENSE_CANONICALIZATION_FIELDS: [&str; 5] = [
    "customerName",
    "licenseId",
    "plan",
    "issuedAt",
    "expiresAt",
];

const LICENSE_CONTRACT_JSON: &str = include_str!("../../shared/license-contract.json");

#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseContractPublicKey {
    pub id: Option<String>,
    pub key: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseContract {
    pub algorithm: String,
    pub canonicalization_version: u32,
    pub canonicalization_fields: Vec<String>,
    pub public_key_base64_url: Option<String>,
    pub public_keys: Option<Vec<LicenseContractPublicKey>>,
}

impl LicenseContract {
    pub fn resolved_public_keys(&self) -> Result<Vec<String>, String> {
        let mut keys: Vec<String> = Vec::new();

        if let Some(public_keys) = &self.public_keys {
            for entry in public_keys {
                let key = entry.key.trim();
                if key.is_empty() {
                    return Err("shared license contract has invalid public key entry".to_string());
                }
                if !keys.iter().any(|existing| existing == key) {
                    keys.push(key.to_string());
                }
            }
        }

        if let Some(legacy_key) = &self.public_key_base64_url {
            let key = legacy_key.trim();
            if !key.is_empty() && !keys.iter().any(|existing| existing == key) {
                keys.push(key.to_string());
            }
        }

        if keys.is_empty() {
            return Err("shared license contract has no valid public keys".to_string());
        }

        Ok(keys)
    }
}

pub fn load_license_contract() -> Result<LicenseContract, String> {
    let contract: LicenseContract = serde_json::from_str(LICENSE_CONTRACT_JSON)
        .map_err(|error| format!("failed to parse shared license contract: {error}"))?;

    if contract.algorithm != EXPECTED_LICENSE_SIGNATURE_ALGORITHM {
        return Err("shared license contract has unsupported algorithm".to_string());
    }

    if contract.canonicalization_version != EXPECTED_LICENSE_CANONICALIZATION_VERSION {
        return Err("shared license contract has unsupported canonicalization version".to_string());
    }

    if contract.canonicalization_fields.len() != EXPECTED_LICENSE_CANONICALIZATION_FIELDS.len()
        || contract
            .canonicalization_fields
            .iter()
            .zip(EXPECTED_LICENSE_CANONICALIZATION_FIELDS.iter())
            .any(|(left, right)| left != right)
    {
        return Err("shared license contract has unexpected canonicalization fields".to_string());
    }

    contract.resolved_public_keys()?;

    Ok(contract)
}
