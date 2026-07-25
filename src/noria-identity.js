"use strict";

const PUBLIC_PLUGIN_ID = "noria";
const PUBLIC_PLUGIN_NAME = "Noria";
const PUBLIC_REPOSITORY = "obsidian-noria";
const NORIA_HOME_ICON_ID = "noria-home";
const NORIA_OBSIDIAN_ICON_SCALE = "4.166666667";

const NORIA_MARK_PATH = "M4.769 18.625 C4.769 18.322 4.769 17.413 4.769 16.806 C4.769 16.200 4.768 15.593 4.769 14.987 C4.769 14.381 4.766 13.773 4.772 13.169 C4.778 12.566 4.773 11.957 4.805 11.364 C4.837 10.771 4.861 10.173 4.962 9.612 C5.063 9.051 5.190 8.490 5.411 7.999 C5.632 7.508 5.927 7.036 6.287 6.666 C6.646 6.297 7.102 5.980 7.568 5.784 C8.034 5.588 8.578 5.482 9.082 5.489 C9.585 5.496 10.124 5.620 10.590 5.825 C11.057 6.031 11.500 6.358 11.881 6.722 C12.262 7.085 12.581 7.548 12.876 8.007 C13.172 8.467 13.411 8.979 13.656 9.479 C13.900 9.979 14.115 10.497 14.344 11.006 C14.572 11.515 14.780 12.042 15.025 12.531 C15.271 13.021 15.510 13.543 15.817 13.944 C16.123 14.346 16.482 14.741 16.863 14.939 C17.244 15.137 17.715 15.221 18.101 15.133 C18.487 15.045 18.894 14.762 19.180 14.411 C19.465 14.059 19.668 13.538 19.812 13.024 C19.956 12.511 20.007 11.906 20.041 11.330 C20.075 10.754 20.071 10.139 20.016 9.568 C19.961 8.997 19.886 8.406 19.712 7.904 C19.537 7.401 19.293 6.902 18.969 6.553 C18.646 6.205 18.205 5.925 17.770 5.812 C17.336 5.699 16.828 5.751 16.363 5.874 C15.898 5.996 15.211 6.433 14.981 6.545";

function buildNoriaMarkBody() {
  return `<path d="${NORIA_MARK_PATH}" transform="scale(${NORIA_OBSIDIAN_ICON_SCALE})" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />`;
}

function registerNoriaHomeIcon(obsidianApi) {
  if (!obsidianApi || typeof obsidianApi.addIcon !== "function") return false;

  try {
    obsidianApi.addIcon(NORIA_HOME_ICON_ID, buildNoriaMarkBody());
    return true;
  } catch {
    return false;
  }
}

function hasNoriaHomeMark(element) {
  if (!element || typeof element.querySelector !== "function") return false;
  try {
    return !!element.querySelector(`path[d="${NORIA_MARK_PATH}"]`);
  } catch {
    return false;
  }
}

function appendNoriaHomeMark(element) {
  const documentRef = element?.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!element || !documentRef || typeof documentRef.createElementNS !== "function") return false;

  try {
    const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList?.add?.("svg-icon", "noria-home-icon");

    const path = documentRef.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", NORIA_MARK_PATH);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2.15");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    if (typeof element.replaceChildren === "function") element.replaceChildren(svg);
    else {
      while (element.firstChild && typeof element.removeChild === "function") element.removeChild(element.firstChild);
      element.appendChild?.(svg);
    }
    return hasNoriaHomeMark(element);
  } catch {
    return false;
  }
}

function ensureNoriaHomeRibbonIcon(element, obsidianApi) {
  if (!element) return false;
  try {
    if (typeof obsidianApi?.setIcon === "function") obsidianApi.setIcon(element, NORIA_HOME_ICON_ID);
  } catch {}
  if (hasNoriaHomeMark(element)) return true;
  return appendNoriaHomeMark(element);
}

module.exports = {
  PUBLIC_PLUGIN_ID,
  PUBLIC_PLUGIN_NAME,
  PUBLIC_REPOSITORY,
  NORIA_HOME_ICON_ID,
  NORIA_MARK_PATH,
  buildNoriaMarkBody,
  registerNoriaHomeIcon,
  ensureNoriaHomeRibbonIcon
};
