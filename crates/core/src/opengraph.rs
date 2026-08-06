use serde::{Deserialize, Serialize};
use scraper::{Html, Selector};
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct LinkMetadata {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub site_name: Option<String>,
}

pub fn fetch_link_metadata(target_url: &str) -> Result<LinkMetadata> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Antigravity-Milanote/1.0")
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let response = client.get(target_url).send()?.error_for_status()?;
    let html_content = response.text()?;

    let document = Html::parse_document(&html_content);
    let meta_selector = Selector::parse("meta").map_err(|e| AppError::InvalidOperation(format!("Invalid selector: {:?}", e)))?;
    let title_selector = Selector::parse("title").map_err(|e| AppError::InvalidOperation(format!("Invalid selector: {:?}", e)))?;

    let mut metadata = LinkMetadata {
        url: target_url.to_string(),
        ..Default::default()
    };

    if let Some(title_elem) = document.select(&title_selector).next() {
        metadata.title = Some(title_elem.text().collect::<Vec<_>>().join(" ").trim().to_string());
    }

    for element in document.select(&meta_selector) {
        let property = element.value().attr("property").or_else(|| element.value().attr("name")).unwrap_or("");
        let content = element.value().attr("content").unwrap_or("");

        if content.is_empty() {
            continue;
        }

        match property {
            "og:title" | "twitter:title" => {
                metadata.title = Some(content.to_string());
            }
            "og:description" | "twitter:description" | "description" => {
                metadata.description = Some(content.to_string());
            }
            "og:image" | "twitter:image" => {
                metadata.image = Some(content.to_string());
            }
            "og:site_name" => {
                metadata.site_name = Some(content.to_string());
            }
            _ => {}
        }
    }

    Ok(metadata)
}
