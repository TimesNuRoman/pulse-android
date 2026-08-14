/*
 * SearchViewModel — runs the FTS query and exposes a debounced result list.
 */
package com.pulse.android.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulse.android.data.db.SearchResult
import com.pulse.android.data.repo.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val results: List<SearchResult> = emptyList(),
    val isLoading: Boolean = false,
)

@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val noteRepo: NoteRepository,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    private val _state = MutableStateFlow(SearchUiState())
    val state = _state.asStateFlow()

    init {
        _query
            .debounce(120)
            .distinctUntilChanged()
            .onEach { q ->
                _state.value = _state.value.copy(query = q, isLoading = q.isNotEmpty())
                val res = if (q.isEmpty()) emptyList() else noteRepo.search(q)
                _state.value = _state.value.copy(results = res, isLoading = false)
            }
            .launchIn(viewModelScope)
    }

    fun setQuery(q: String) {
        _query.value = q
        _state.value = _state.value.copy(query = q)
    }
}
