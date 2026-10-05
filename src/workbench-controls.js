"use strict";
const {setIcon, setTooltip} = require("obsidian");

// Diary and review share the host application's icons, labels and tooltips.
// The caller retains the action and its existing save/error behavior.
function setActionIcon(button, icon, label) {
  button.setText("");
  setIcon(button, icon);
  setTooltip(button, label);
  button.setAttribute("aria-label", label);
  return button;
}

// Keep the native command (and its user-assigned shortcuts). Reading has no
// active editor, so route just the active Noria date surface before delegating.
function installWorkbenchModeCommand(plugin) {
  const app=plugin.app,command=app.commands?.commands?.["markdown:toggle-preview"];
  if(typeof command?.checkCallback!=="function")return;
  const previous=command.checkCallback;
  const handler=checking=>{
    const view=app.workspace.activeLeaf?.view,w=view?.workbench,d=w?.diary;
    if(view?.plugin!==plugin || w?.active!=="diary" || !d?.session)return previous.call(command,checking);
    const review=d.intent==="review"?d.review?.reviewWorkspace:null;
    if(d.intent==="review"&&!review)return false;
    if(checking)return true;
    const action=review?(review.mode==="edit"?review.showOverview():review.startEditing(review.mode==="focus"?review.focusedIndex:-1)):d.toggleEditing();
    Promise.resolve(action).catch(error=>d.report(error));
    return true;
  };
  command.checkCallback=handler;
  plugin.register(()=>{if(command.checkCallback===handler)command.checkCallback=previous;});
}
module.exports = {setActionIcon,installWorkbenchModeCommand};
