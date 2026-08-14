/*
 * SkillsViewModel — list + edit + delete for skills. Mirrors the desktop
 * SkillsScreen feature with 5 v2 nitpicks applied (Pinned-always, Accept-rate
 * tooltip, Triggers-?-help, Cmd/Ctrl cross-platform is N/A on Android —
 * editor has Save button + back gesture instead, Show more paginate in
 * History).
 */
package com.pulse.android.ui.skills

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.skills.Skill
import com.pulse.android.data.skills.SkillRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class SkillsViewModel @Inject constructor(
    private val repo: SkillRepository,
) : ViewModel() {
    val skills: StateFlow<List<Skill>> = repo.skills

    fun upsert(skill: Skill) = repo.upsert(skill)
    fun delete(id: String) = repo.delete(id)
}
