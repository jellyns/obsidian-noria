"use strict";
// Build scripts replace this constant. Source-level domain tests use the full feature.
module.exports = (typeof __NORIA_MEDIA__ === 'undefined' || __NORIA_MEDIA__) ? {
 register(system){require('./media-card.js').registerMediaCard(system);require('./media-workspace.js').registerMediaWorkspace(system);},
 libraryView(...args){return require('./media-workspace-model.js').libraryView(...args);},
 libraryWidgets(...args){return require('./media-workspace-model.js').libraryWidgets(...args);},
 renderPage(...args){return require('./media-page.js').renderMediaPage(...args);},
 types(...args){return require('./media-catalog.js').mediaTypes(...args);},
 coverSource(...args){return require('./media-card.js').coverSource(...args);},
 bindCoverImage(...args){return require('./media-cover.js').bindCoverImage(...args);},
 watchCoverImages(...args){return require('./media-cover.js').watchCoverImages(...args);},
 openReading(...args){return require('./media-access.js').openReading(...args);},
 openWork(...args){return require('./media-workspace.js').openWork(...args);},
 api(...args){return require('./media-api.js').createMediaApi(...args);},
 operations(){return require('./media-api.js').operations;},
 tools(...args){return require('./media-agent.js').tools(...args);}
} : null;
