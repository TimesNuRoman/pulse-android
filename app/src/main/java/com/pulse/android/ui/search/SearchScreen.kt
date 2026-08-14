/*
 * SearchScreen — full-width search input + result list with highlighted snippets.
 *   Empty query: "Type to search across N notes"
 *   No results: "No notes match 'foo'" + "Try a shorter query"
 *
 * Tap result → opens the note editor.
 */
package com.pulse.android.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.pulse.android.theme.PulseBg
import com.pulse.android.theme.PulsePrimary
import com.pulse.android.theme.PulseSurface
import com.pulse.android.theme.PulseText
import com.pulse.android.theme.PulseTextDim
import com.pulse.android.theme.PulseTextMuted
import com.pulse.android.ui.components.Icons
import com.pulse.android.ui.components.TopBar

@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onOpenNote: (String) -> Unit,
    noteCount: Int = 0,
    vm: SearchViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseBg),
    ) {
        TopBar(title = "Search", onBack = onBack)
        SearchInput(
            query = state.query,
            onQueryChange = vm::setQuery,
            onClear = { vm.setQuery("") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
        Text(
            text = if (state.query.isEmpty()) "" else "${state.results.size} results",
            color = PulseTextDim,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
        )
        when {
            state.query.isEmpty() -> EmptyHint(count = noteCount)
            state.results.isEmpty() && !state.isLoading -> NoResults(query = state.query)
            else -> ResultList(results = state.results, onOpen = onOpenNote)
        }
    }
}

@Composable
private fun SearchInput(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .height(44.dp)
            .background(PulseSurface),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Search,
            contentDescription = null,
            tint = PulseTextMuted,
            modifier = Modifier.padding(start = 12.dp).size(18.dp),
        )
        TextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            placeholder = { Text("Type to search…", color = PulseTextMuted, style = MaterialTheme.typography.bodyMedium) },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                cursorColor = PulsePrimary,
                focusedTextColor = PulseText,
                unfocusedTextColor = PulseText,
            ),
            modifier = Modifier.weight(1f),
        )
        if (query.isNotEmpty()) {
            IconButton(onClick = onClear) {
                Icon(imageVector = Icons.Close, contentDescription = "Clear", tint = PulseTextMuted)
            }
        }
    }
}

@Composable
private fun EmptyHint(count: Int) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Type to search across $count notes",
            color = PulseTextMuted,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun NoResults(query: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "No notes match '$query'",
                color = PulseText,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = "Try a shorter query",
                color = PulseTextDim,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun ResultList(results: List<com.pulse.android.data.db.SearchResult>, onOpen: (String) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(results, key = { it.id }) { r ->
            ResultRow(
                title = r.title,
                snippet = r.snippet,
                onClick = { onOpen(r.id) },
            )
        }
    }
}

@Composable
private fun ResultRow(title: String, snippet: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = title,
            color = PulseText,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = snippet,
            color = PulseTextDim,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
