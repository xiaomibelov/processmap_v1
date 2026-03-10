(function(){
  function keyDraft(sid){ return "fpc:notesDraft:" + (sid || ""); }
  function getNotesEl(){ return document.getElementById("notes"); }

  var installed = false;

  function installOnce(){
    if(installed) return;
    installed = true;
    var ta = getNotesEl();
    if(!ta) return;
    ta.addEventListener("input", function(){
      var sid = window.FPCNotesPersist ? window.FPCNotesPersist._sid : null;
      if(!sid) return;
      try{ localStorage.setItem(keyDraft(sid), ta.value); }catch(e){}
    });
  }

  var api = {
    _sid: null,

    onSessionId: function(sid){
      this._sid = sid;
      installOnce();
      var ta = getNotesEl();
      if(!ta) return;
      try{
        var draft = localStorage.getItem(keyDraft(sid));
        if(draft !== null && draft !== undefined){
          ta.value = draft;
        }
      }catch(e){}
    },

    onSessionLoaded: function(sid, session){
      this._sid = sid;
      installOnce();
      var ta = getNotesEl();
      if(!ta) return;

      var hasDraft = false;
      try{
        var draft = localStorage.getItem(keyDraft(sid));
        if(draft !== null && draft !== undefined){
          ta.value = draft;
          hasDraft = true;
        }
      }catch(e){}

      if(!hasDraft){
        if(session && typeof session.notes === "string"){
          ta.value = session.notes;
        }
      }
    }
  };

  window.FPCNotesPersist = api;
})();